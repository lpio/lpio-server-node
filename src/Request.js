import Emitter from 'events'
import Multiplexer from 'lpio-multiplexer-js'

export default class Request extends Emitter {
  static STATES = {
    RECONNECT: 0,
    NEW_MESSAGES: 1,
    ERROR: 2
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

  open(messages) {
    this.adapter.on(`message:${this.user}`, this.onMessage)

    this.adapter.dispatch(messages, err => {
      if (err) return this.onError(err)
      getMessages.call(this)
    })

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
    this.emit('close', {state, messages})
    this.multiplexer.destroy()
    this.adapter.removeListener(`message:${this.user}`, this.onMessage)
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
