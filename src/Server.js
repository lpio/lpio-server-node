import Emitter from 'events'
import uid from 'get-uid'

import MemoryAdapter from './MemoryAdapter'
import Request from './Request'

export default class Server {
  static DEFAULTS = {
    ackTimeout: 10000,
    adapter: new MemoryAdapter(),
    multiplex: undefined
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
  open({user, client, messages}) {
    let err
    if (!user) err = new Error('User undefined.')
    if (!client) err = new Error('Client undefined.')
    if (this.destroyed) err = new Error('Server is destroyed.')

    if (err) {
      this.out.emit('error', err)
      return this.out
    }

    // If we have already an open request to this client - close it.
    if (this.requests[client]) this.close(client, Request.RECONNECT)

    let req = new Request({...this.options, user, client, serverId: this.id})
    this.requests[client] = req
    req.out.once('close', () => this.onClose(client))
    req.open(messages)
    return req.out
  }

  /**
   * Closes a request for the passed client.
   *
   * @api public
   */
  close(client, state = Request.CLIENT_ABORT) {
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
      this.close(client, Request.SERVER_DESTROYED)
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
    if (!options.recipient) errMsg = 'Recipient is undefined.'
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

  onClose(client) {
    // Don't use delete to not to make this object slow.
    this.requests[client] = undefined
  }
}
