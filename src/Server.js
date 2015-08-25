import Emitter from 'events'
import uid from 'get-uid'

import MemoryAdapter from './MemoryAdapter'
import Request from './Request'

export default class Server extends Emitter {
  static DEFAULTS = {
    ackTimeout: 10000,
    keepAlive: undefined,
    disconnectedAfter: 40000,
    adapter: new MemoryAdapter(),
    multiplex: undefined
  }

  constructor(options) {
    super()
    this.options = {...Server.DEFAULTS, ...options}
    this.id = uid()
    this.adapter = this.options.adapter
    this.destroyed = false
    this.requests = {}
  }

  open({user, client, messages}) {
    let err
    if (!user) err = new Error('User undefined.')
    if (!client) err = new Error('Client undefined.')
    if (this.destroyed) err = new Error('Server is destroyed.')

    // For consistent chaining support.
    if (err) return this.onError(err, new Emitter())

    // If we have already an open request to this client - close it.
    if (this.requests[client]) this.close(client, Request.RECONNECT)

    let req = new Request({...this.options, user, client, serverId: this.id})
    this.requests[client] = req
    req.once('close', () => this.onClose(client))
    req.open(messages)
    return req
  }

  /**
   * Closes a request for the passed client.
   */
  close(client, state = Request.CLIENT_ABORT) {
    let req = this.requests[client]
    if (req) req.close(state)
    return this
  }

  /**
   * Destroy the server.
   */
  destroy() {
    Object.keys(this.requests).forEach(client => {
      this.close(client, Request.SERVER_DESTROYED)
    })
    this.adapter.destroy()
    this.removeAllListeners()
    this.destroyed = true
    return this
  }


  /**
   * Push a message to the client.
   */
  send(options, callback) {
    let errMsg
    if (!options.data) errMsg = 'Data is undefined.'
    if (!options.recipient) errMsg = 'Recipient is undefined.'
    if (errMsg) return process.nextTick(callback.bind(null, new Error(errMsg)))

    let message = {
      id: String(uid()),
      type: 'user',
      ...options
    }

    this.adapter.dispatch(message, err => {
      if (err) return callback(err)

      let timeoutId
      let onAck = () => {
        clearTimeout(timeoutId)
        callback()
      }
      this.adapter.once(`ack:${message.id}`, onAck)
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

  onError(err, emitter = this) {
    if (err) emitter.emit('error', err)
    return emitter
  }
}
