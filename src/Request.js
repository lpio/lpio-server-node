import Emitter from 'events'
import Multiplexer from 'lpio-multiplexer'
import * as states from './states'

export default class Request {
  constructor(options) {
    this.options = options
    this.channels = this.options.channels
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
   * - subscribe new messages for the channels while this request is alive, schedule them
   * - dispatch recieved messages
   * - schedule acks for received messages
   * - get new messages for the client, schedule them
   *
   * @api public
   */
  open(messages) {
    if (!this.client) {
      this.client = this.options.getClientId(this.options.req)
      process.nextTick(() => {
        this.close(states.RECONNECT, undefined, {id: this.client})
      })
      return
    }

    let getMessages = () => {
      this.adapter.get(this.channels, this.client, (err, newMessages) => {
        if (err) return this.onError(err)
        newMessages.forEach(this.onMessage)
      })
    }

    // Listen for new messages for the client.
    this.channels.forEach(channel => {
      this.adapter.out.on(`message:${channel}`, this.onMessage)
    })

    if (messages.length) {
      // Server confirms messages reception after they have been saved to DB.
      messages.forEach(message => {
        if (message.type === 'ack') {
          message.client = this.client
        }
        else {
          this.onMessage({
            type: 'ack',
            id: message.id
          })
          // This will avoid receiving this message by this client who sent it.
          messages.push({
            type: 'ack',
            id: message.id,
            client: this.client
          })
        }
        this.out.emit('message', message)
        if (message.type === 'data' && message.data) this.out.emit('data', message.data)
      })

      this.adapter.dispatch(messages, err => {
        if (err) return this.onError(err)
        getMessages()
      })
    }
    else getMessages()

    setTimeout(() => {
      this.close()
    }, this.options.responseTimeout)
  }

  /**
   * Close request - destroy everything related.
   *
   * @api public
   */
  close(state = states.RECONNECT, messages = [], set) {
    if (this.closed) return
    this.closed = true
    this.multiplexer.destroy()
    this.channels.forEach(channel => {
      this.adapter.out.removeListener(`message:${channel}`, this.onMessage)
    })
    this.out.emit('close', {state, messages, set})
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
