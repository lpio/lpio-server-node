import Emitter from 'events'
import Multiplexer from 'lpio-multiplexer'
import * as states from './states'

export default class Request {
  constructor(options) {
    this.options = options
    this.user = this.options.user
    this.client = this.options.client
    this.closed = false
    this.adapter = this.options.adapter
    this.out = new Emitter()
    this.multiplexer = new Multiplexer(this.options.multiplex)
    this.multiplexer.on('drain', ::this.onDrain)
    this.onMessage = ::this.onMessage
  }

  /**
   * Open a request, messages are incomming.
   *
   * - subscribe new messages for the user while this request is alive, schedule them
   * - dispatch recieved messages
   * - schedule acks for received messages
   * - get new messages for the client, schedule them
   *
   * @api public
   */
  open(messages) {
    if (!this.client) {
      this.client = this.options.getClientId(this)
      process.nextTick(() => {
        this.close(states.NEW_MESSAGES, [{
          type: 'option',
          id: 'client',
          data: this.client,
          client: this.options.serverId,
          recipient: this.user,
          sender: 'server'
        }])
      })
      return
    }

    // Listen for new messages for the client.
    this.adapter.out.on(`message:${this.user}`, this.onMessage)

    if (messages.length) {
      this.adapter.dispatch(messages, err => {
        if (err) return this.onError(err)
        // Server confirms messages reception after they have been saved to DB.
        messages.forEach(message => {
          if (message.type !== 'ack') {
            this.multiplexer.add({
              type: 'ack',
              id: message.id,
              client: this.options.serverId,
              recipient: this.user,
              sender: 'server'
            })
          }
          this.out.emit('message', message)
          if (message.data) this.out.emit('data', message.data)
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

  /**
   * Close request - destroy everything related.
   *
   * @api public
   */
  close(state = states.RECONNECT, messages = []) {
    if (this.closed) return
    this.closed = true
    this.multiplexer.destroy()
    this.adapter.out.removeListener(`message:${this.user}`, this.onMessage)
    this.out.emit('close', {state, messages})
    this.out.removeAllListeners()
  }

  onMessage(message) {
    this.multiplexer.add(message)
  }

  onDrain(messages) {
    this.close(states.NEW_MESSAGES, messages)
  }

  onError(err) {
    if (!err) return
    this.out.emit('error', err)
    this.close(states.ERROR)
  }
}
