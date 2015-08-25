export default class MemoryAdapter {
  static DEFAULTS = {
    // Max message lifetime.
    maxAge: 1000 * 60 * 60,
    // Cleanup messages has periodically.
    cleanupInterval: 1000 * 60 * 3
  }

  constructor(options) {
    this.options = {...MemoryAdapter.DEFAULTS, ...options}
    this.messages = {}
    let {cleanupInterval} = this.options
    if (cleanupInterval > 0) {
      this.cleanupIntervalId = setInterval(::this.cleanup, cleanupInterval)
    }
  }

  /**
   * Save the message, emit event.
   * If message is an array, all messages will be dispached. Only first error
   * will be passed to callback.
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
      message.acks = []
      message.timestamp = Date.now()
      this.messages[message.id] = message
      this.emit(`message:${message.recipient}`, message)
    }
    else if (message.type === 'ack' && this.messages[message.id]) {
      this.messages[message.id].acks.push(message)
      this.emit(`ack:${message.id}`)
    }

    process.nextTick(callback)

    return this
  }

  /**
   * Get all new messages for the recipient for a specific client.
   */
  get(recipient, client, callback) {
    let messages = []

    Object.keys(this.messages).forEach(id => {
      let message = this.messages[id]
      if (message.recipient === recipient) {
        // Only return this message if this client didn't get it already.
        let hasAck = message.acks.some(ack => ack.client === client)
        if (!hasAck) messages.push(message)
      }
    })

    process.nextTick(callback.bind(null, null, messages))
    return this
  }

  destroy() {
    clearInterval(this.cleanupIntervalId)
    this.removeAllListeners()
    this.messages = {}
    return this
  }

  /**
   * Cleanup cache.
   */
  cleanup() {
    let now = Date.now()
    Object.keys(this.messages).forEach(id => {
      let message = this.messages[id]
      if (message.timestamp + this.options.maxAge < now) {
        delete this.messages[id]
      }
    })
  }
}
