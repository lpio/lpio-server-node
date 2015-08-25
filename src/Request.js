import Emitter from 'events'
import Multiplexer from 'lpio-multiplexer-js'

export default class Request extends Emitter {
  static STATES = {
    RECONNECT: 0,
    NEW_MESSAGES: 1,
    ERROR: 2,
    SERVER_DESTROYED: 3,
    CLIENT_ABORT: 4
  }

  static DEFAULTS = {
    keepAlive: 25000
  }

  constructor(options) {
    super()
    this.options = options
    this.user = this.options.user
    this.client = this.options.client
    this.closed = false
    this.adapter = this.options.adapter
    this.multiplexer = new Multiplexer(this.options.multiplex)
    this.multiplexer.on('drain', ::this.onDrain)
    this.onMessage = ::this.onMessage
  }

  /**
   * Open a request, messages are incomming.
   */
  open(messages) {
    // Listen for new messages for the client.
    this.adapter.on(`message:${this.user}`, this.onMessage)

    if (messages.length) {
      this.adapter.dispatch(messages, err => {
        if (err) return this.onError(err)
        // Server confirms messages reception after they have been saved to DB.
        messages.forEach(message => {
          if (message.type !== 'user') return
          this.multiplexer.add({
            type: 'ack',
            id: message.id,
            client: this.options.serverId,
            recipient: this.user,
            sender: 'server'
          })
          this.emit('message', message)
          this.emit('data', message.data)
        })
        getMessages.call(this)
      })
    }
    else getMessages.call(this)

    function getMessages() {
      this.adapter.get(this.user, this.client, (err, newMessages) => {
        if (err) return this.onError(err)
        newMessages.forEach(this.onMessage)
      })
    }
  }

  close(state = Request.STATES.RECONNECT, messages = []) {
    if (this.closed) return
    this.closed = true
    this.multiplexer.destroy()
    this.adapter.removeListener(`message:${this.user}`, this.onMessage)
    this.emit('close', {state, messages})
    this.removeAllListeners()
  }

  onMessage(message) {
    this.multiplexer.add(message)
  }

  onDrain(messages) {
    this.close(Request.STATES.NEW_MESSAGES, messages)
  }

  onError(err) {
    if (!err) return
    this.emit('error', err)
    this.close(Request.STATES.ERROR)
  }
}
