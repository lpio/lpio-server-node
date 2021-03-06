import Emitter from 'events'
import uid from 'get-uid'

import MemoryAdapter from './MemoryAdapter'
import Request from './Request'
import * as states from './states'

const MESSAGE_TYPES = ['ack', 'data', 'option']

export default class Server {
  static DEFAULTS = {
    ackTimeout: 10000,
    adapter: new MemoryAdapter(),
    multiplex: undefined,
    getClientId: undefined,
    responseTimeout: 20000
  }

  constructor(options) {
    this.options = {...Server.DEFAULTS, ...options}
    this.id = String(uid())
    this.adapter = this.options.adapter
    this.destroyed = false
    this.requests = {}
    this.out = new Emitter()
  }

  /**
   * Open a request.
   *
   * - close existing requests for the client if any
   * - create new request instance
   * - call req.open(..)
   *
   * @api public
   */
  open(params) {
    if (!this.validate(params)) return this.out

    // If we have already an open request to this client - close it.
    if (this.requests[params.client]) this.close(params.client, states.RECONNECT)

    let req = new Request({
      ...this.options,
      channels: params.channels,
      client: params.client,
      req: params.req,
      serverId: this.id
    })
    this.requests[req.client] = req
    req.out.once('close', () => this.onClose(req.client))
    req.open(params.messages)
    return req.out
  }

  /**
   * Closes a request for the passed client.
   *
   * @api public
   */
  close(client, state = states.CLIENT_ABORT) {
    let req = this.requests[client]
    if (req) req.close(state)
    return this
  }

  /**
   * Destroy the server.
   *
   * @api public
   */
  destroy() {
    Object.keys(this.requests).forEach(client => {
      this.close(client, states.SERVER_DESTROYED)
    })
    this.adapter.destroy()
    this.out.removeAllListeners()
    this.destroyed = true
    return this
  }


  /**
   * Send a message to the client.
   *
   * - dispatch the message on adapter
   * - subscribe ack message
   * - call back with error when didn't receive ack within `ackTimeout`
   *
   * @api public
   */
  send(options, callback) {
    let errMsg
    if (!options.data) errMsg = 'Data is undefined.'
    if (!options.channel) errMsg = 'Channel is undefined.'
    if (errMsg) return process.nextTick(callback.bind(null, new Error(errMsg)))

    let message = {
      id: String(uid()),
      type: 'data',
      ...options
    }

    this.adapter.dispatch(message, err => {
      if (err) return callback(err)

      let timeoutId
      let onAck = () => {
        clearTimeout(timeoutId)
        callback()
      }
      this.adapter.out.once(`ack:${message.id}`, onAck)
      timeoutId = setTimeout(() => {
        this.removeListener(`ack:${message.id}`, onAck)
        callback(new Error('Delivery timeout.'))
      }, this.options.ackTimeout)
    })
  }

  validate({channels, messages}) {
    let onError = err => {
      process.nextTick(this.onError.bind(this, err))
      return false
    }

    if (this.destroyed) return onError(new Error('Server is destroyed.'))
    if (!channels || !channels.length) return onError(new Error('Empty channels.'))

    let err
    messages.some(message => {
      if (typeof message.id !== 'string') {
        err = new Error('Bad message id.')
      }
      else if (message.type !== 'ack' && typeof message.channel !== 'string') {
        err = new Error('Bad message channel.')
      }
      else if (message.type === 'data' && !message.data) {
        err = new Error('Bad message data.')
      }
      else if (MESSAGE_TYPES.indexOf(message.type) === -1) {
        err = new Error('Bad message type.')
      }

      if (err) {
        err.data = message
        return true
      }
    })
    return err ? onError(err) : true
  }

  onClose(client) {
    // Don't use delete to not to make this object slow.
    this.requests[client] = undefined
  }

  onError(err) {
    this.out.emit('error', err)
    this.out.emit('close', {
      state: states.ERROR,
      error: err.message,
      messages: []
    })
  }
}
