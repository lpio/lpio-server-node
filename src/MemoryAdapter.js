import Emitter from 'events'

export default class MemoryAdapter extends Emitter {
  static DEFAULTS = {
    // Max message lifetime.
    maxAge: 1000 * 60 * 60,
    // Cleanup messages has periodically.
    cleanupInterval: 1000 * 60 * 3
  }

  constructor(options) {
    super()
    this.options = {...MemoryAdapter.DEFAULTS, ...options}
    this.messages = {}
    this.metas = {}
    let {cleanupInterval} = this.options
    if (cleanupInterval > 0) {
      this.cleanupIntervalId = setInterval(::this.cleanup, cleanupInterval)
    }
  }

  /**
   * Save the message, emit event.
   * If message is an array, all messages will be dispached. Only first error
   * will be passed to callback.
   *
   * @api public
   */
  dispatch(message, callback) {
    if (Array.isArray(message)) {
      let messages = message
      if (!messages.length) {
        process.nextTick(callback)
        return this
      }

      let done = false
      let todo = messages.length

      let onDispatch = err => {
        if (done) return
        todo = err ? 0 : todo - 1
        if (!todo) {
          done = true
          callback(err)
        }
      }

      messages.forEach(msg => this.dispatch(msg, onDispatch))
      return this
    }

    if (message.type === 'user') {
      this.metas[message.id] = {
        acks: [],
        timestamp: Date.now()
      }
      this.messages[message.id] = message
      // Message has been theoretically saved to the DB.
      this.emit(`message:${message.recipient}`, message)
    }
    else if (message.type === 'ack' && this.messages[message.id]) {
      this.metas[message.id].acks.push(message)
      this.emit(`ack:${message.id}`, message)
    }

    process.nextTick(callback)

    return this
  }

  /**
   * Get all new messages for the recipient for a specific client.
   *
   * @api public
   */
  get(recipient, client, callback) {
    let messages = []

    let clientMatch = ack => ack.client === client

    Object.keys(this.messages).forEach(id => {
      let message = this.messages[id]
      if (message.recipient === recipient) {
        // Only return this message if this client didn't get it already.
        let hasAck = this.metas[message.id].acks.some(clientMatch)
        if (!hasAck) messages.push(message)
      }
    })

    process.nextTick(callback.bind(null, null, messages))
    return this
  }

  /**
   * Desrpy adapter.
   *
   * @api public
   */
  destroy() {
    clearInterval(this.cleanupIntervalId)
    this.removeAllListeners()
    this.messages = {}
    return this
  }

  /**
   * Cleanup cache.
   *
   * @api private
   */
  cleanup() {
    let now = Date.now()
    Object.keys(this.messages).forEach(id => {
      let message = this.messages[id]
      if (this.metas[message.id].timestamp + this.options.maxAge < now) {
        delete this.messages[id]
        delete this.metas[id]
      }
    })
  }
}
