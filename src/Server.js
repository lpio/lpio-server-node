import Emitter from 'events'

import MemoryAdapter from './MemoryAdapter'
import Request from './Request'

export default class Server extends Emitter {
  static DEFAULTS = {
    ackTimeout: 10000,
    keepAlive: 25000,
    disconnectedAfter: 40000,
    adapter: new MemoryAdapter(),
    multiplex: undefined
  }

  constructor(options) {
    super()
    this.options = {...Server.DEFAULTS, ...options}
    this.destroyed = false
    this.requests = {}
  }

  open({user, client, messages}) {
    if (!user) return this.onError(new Error('User undefined.'))
    if (!client) return this.onError(new Error('Client undefined.'))
    if (this.destroyed) return this.onError(new Error('Server is destroyed.'))

    // If we have already an open request to this client - close it.
    this.close(client)

    let req = new Request({...this.options, user, client})
    this.requests[client] = req
    req.once('close', () => this.onClose(client))
    req.open(messages)
    return req
  }

  /**
   * Destroy the server.
   */
  destroy() {
    Object.keys(this.requests).forEach(client => {
      this.requests[client].close()
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
      id: uid(),
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
        this.off(`ack:${message.id}`, onAck)
        callback(new Error('Delivery timeout.'))
      }, this.options.ackTimeout)
    })
  }

  onClose(client) {
    delete this.requests[client]
  }

  onError(err) {
    if (err) this.emit('error', err)
  }
}

function uid() {
  return String(Math.round(Math.random() * Date.now()))
}
