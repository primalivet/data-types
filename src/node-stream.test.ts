import { PassThrough, Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import {
  Map,
  Flat,
  MapAsync,
  sequence,
  sequenceLazy,
  sequenceLazyAsync,
  WritablePromise,
  range,
  Queue,
  QueueMap,
} from './node-stream'

describe('range', () => {
  test('should return a range generator with inclusive start and non inclusive end', () => {
    const generator = range(0, 3)
    expect(generator.next()).toEqual({ done: false, value: 0 })
    expect(generator.next()).toEqual({ done: false, value: 1 })
    expect(generator.next()).toEqual({ done: false, value: 2 })
    expect(generator.next()).toEqual({ done: true, value: undefined })
  })

  test('should return a range generator with inclusive start and end', () => {
    const generator = range(0, 3, true, true)
    expect(generator.next()).toEqual({ done: false, value: 0 })
    expect(generator.next()).toEqual({ done: false, value: 1 })
    expect(generator.next()).toEqual({ done: false, value: 2 })
    expect(generator.next()).toEqual({ done: false, value: 3 })
    expect(generator.next()).toEqual({ done: true, value: undefined })
  })

  test('should return a range generator with non inclusive start and inclusive end', () => {
    const generator = range(0, 3, false, true)
    expect(generator.next()).toEqual({ done: false, value: 1 })
    expect(generator.next()).toEqual({ done: false, value: 2 })
    expect(generator.next()).toEqual({ done: false, value: 3 })
    expect(generator.next()).toEqual({ done: true, value: undefined })
  })

  test('should return a range generator with non inclusive start and end', () => {
    const generator = range(0, 3, false, false)
    expect(generator.next()).toEqual({ done: false, value: 1 })
    expect(generator.next()).toEqual({ done: false, value: 2 })
    expect(generator.next()).toEqual({ done: true, value: undefined })
  })
})

describe('sequence', () => {
  test('should yield one item at the time in sequence', () => {
    const generator = sequence([1, 2])
    expect(generator.next()).toEqual({ done: false, value: 1 })
    expect(generator.next()).toEqual({ done: false, value: 2 })
    expect(generator.next()).toEqual({ done: true, value: undefined })
  })
})

describe('sequenceLazy', () => {
  test('should yield one item at the time in sequence', () => {
    const generator = sequenceLazy([() => 1, () => 2])
    expect(generator.next()).toEqual({ done: false, value: 1 })
    expect(generator.next()).toEqual({ done: false, value: 2 })
    expect(generator.next()).toEqual({ done: true, value: undefined })
  })

  test('should handle error in thunk (stops generator)', () => {
    const generator = sequenceLazy([
      () => 1,
      () => {
        throw new Error('Error in thunk')
      },
      () => 2,
    ])
    expect(generator.next()).toEqual({ done: false, value: 1 })
    expect(() => generator.next()).toThrow(new Error('Error in thunk'))
    expect(generator.next()).toEqual({ done: true, value: undefined })
  })

  test('should handle rejections in Readable stream (stops generator and emits stream error)', (done) => {
    const generator = sequenceLazy([
      () => 1,
      () => {
        throw new Error('Error in thunk')
      },
      () => 2,
    ])

    const source = Readable.from(generator, { objectMode: true })
    const result: number[] = []
    source.on('data', (chunk) => result.push(chunk))
    source.on('error', (err) => {
      expect(result).toEqual([1])
      expect(err).toEqual(new Error('Error in thunk'))
      done()
    })
  })
})

describe('sequenceLazyAsync', () => {
  test('should yield one item at the time in sequence', async () => {
    const generator = sequenceLazyAsync([
      () => Promise.resolve(1),
      () => Promise.resolve(2),
      () => Promise.resolve(3),
    ])

    expect(await generator.next()).toEqual({ done: false, value: 1 })
    expect(await generator.next()).toEqual({ done: false, value: 2 })
    expect(await generator.next()).toEqual({ done: false, value: 3 })
    expect(await generator.next()).toEqual({ done: true, value: undefined })
  })

  test('should handle rejections in Readable stream (underlying generator stops)', (done) => {
    const generator = sequenceLazyAsync([
      () => Promise.resolve(1),
      () => Promise.reject(new Error('Rejection in lazy promise')),
      () => Promise.resolve(2),
    ])
    const source = Readable.from(generator, { objectMode: true })
    const result: number[] = []
    source.on('data', (chunk) => result.push(chunk))
    source.on('error', (err) => {
      expect(result).toEqual([1])
      expect(err.message).toEqual('Rejection in lazy promise')
      done()
    })
  })

  test('should handle throws in Readable stream (underlying generator stops)', (done) => {
    const generator = sequenceLazyAsync([
      () => Promise.resolve(1),
      () =>
        (async () => {
          throw new Error('Error in lazy promise')
        })(),
      () => Promise.resolve(2),
    ])
    const source = Readable.from(generator, { objectMode: true })
    const result: number[] = []
    source.on('data', (chunk) => result.push(chunk))
    source.on('error', (err) => {
      expect(result).toEqual([1])
      expect(err.message).toEqual('Error in lazy promise')
      done()
    })
  })
})

describe('Flat', () => {
  test('should convert Array<T> chunk into T chunk', (done) => {
    const source = Readable.from([
      [1, 2, 3],
      [4, 5, 6],
    ])
    const transform = new Flat()

    const result: number[] = []
    transform.on('data', (chunk) => result.push(chunk))

    pipeline(source, transform)

    transform.on('end', () => {
      expect(result).toEqual([1, 2, 3, 4, 5, 6])
      done()
    })
  })

  test('should emit error when chunk is not array', (done) => {
    const source = Readable.from([[1, 2, 3], 'not-array'])
    const transform = new Flat()

    pipeline(source, transform).catch((err) => {
      expect(err).toEqual(
        new TypeError('Flat: Expected array but recived: string'),
      )
      done()
    })
  })
})

describe('Map', () => {
  test('should apply the transform function over the chunk', (done) => {
    const double = (x: number) => x * 2
    const source = Readable.from([1, 2, 3])
    const transform = new Map(double)

    const result: number[] = []
    transform.on('data', (chunk) => result.push(chunk))

    pipeline(source, transform)

    transform.on('end', () => {
      expect(result).toEqual([2, 4, 6])
      done()
    })
  })

  test('should emit error from transform function', (done) => {
    const throwingFn = () => {
      throw new Error('Error in transform function')
    }
    const source = Readable.from([1, 2, 3])
    const transform = new Map(throwingFn)

    const result: number[] = []
    transform.on('data', (chunk) => result.push(chunk))

    pipeline(source, transform).catch((err) => {
      expect(err).toEqual(new Error('Error in transform function'))
      done()
    })
  })
})

describe('MapAsync', () => {
  test('should apply the async transform function over the chunk', (done) => {
    const doubleAsync = async (x: number) => x * 2
    const source = Readable.from([1, 2, 3])
    const transform = new MapAsync(doubleAsync)

    const result: number[] = []
    transform.on('data', (chunk) => result.push(chunk))

    pipeline(source, transform)

    transform.on('end', () => {
      expect(result).toEqual([2, 4, 6])
      done()
    })
  })

  test('should emit errors from throw in transform function', (done) => {
    const throwingFn = async () => {
      throw new Error('Error in async transform function')
    }
    const source = Readable.from([1, 2, 3])
    const transform = new MapAsync(throwingFn)

    const result: number[] = []
    transform.on('data', (chunk) => result.push(chunk))

    pipeline(source, transform).catch((err) => {
      expect(err).toEqual(new Error('Error in async transform function'))
      done()
    })
  })

  test('should emit errors from rejection in transform function', (done) => {
    const throwingFn = () => {
      return new Promise((_, rej) =>
        rej(new Error('Rejection in async transform function')),
      )
    }
    const source = Readable.from([1, 2, 3])
    const transform = new MapAsync(throwingFn)

    const result: number[] = []
    transform.on('data', (chunk) => result.push(chunk))

    pipeline(source, transform).catch((err) => {
      expect(err).toEqual(new Error('Rejection in async transform function'))
      done()
    })
  })
})

describe('Queue', () => {
  test('should hold chunks in the queue and release when max queue length is reached', () => {
    const queue = new Queue(3)
    queue.write('1')
    expect(queue.read(1)).toEqual(null)

    queue.write('2')
    expect(queue.read(1)).toEqual(null)

    queue.write('3')
    expect(queue.read(1).toString()).toEqual('1')
    expect(queue.read(1).toString()).toEqual('2')
    expect(queue.read(1).toString()).toEqual('3')
    expect(queue.read(1)).toEqual(null)
  })

  test('should release orphan chunks when stream ends', () => {
    const queue = new Queue(3)
    queue.write('1')
    expect(queue.read(1)).toEqual(null)

    queue.write('2')
    expect(queue.read(1)).toEqual(null)

    queue.end()
    expect(queue.read(1).toString()).toEqual('1')
    expect(queue.read(1).toString()).toEqual('2')
    expect(queue.read(1)).toEqual(null)
  })
})

describe.only('QueueMap', () => {
  test('should hold chunks in the queue and apply transform function and release when max queue length is reached', () => {
    const incStrNum = (x: string) => String(Number(x) + 1)
    const queue = new QueueMap(incStrNum, 3)
    queue.write('1')
    expect(queue.read(1)).toEqual(null)

    queue.write('2')
    expect(queue.read(1)).toEqual(null)

    queue.write('3')
    expect(queue.read(1).toString()).toEqual('2')
    expect(queue.read(1).toString()).toEqual('3')
    expect(queue.read(1).toString()).toEqual('4')
    expect(queue.read(1)).toEqual(null)
  })

  test('should apply transform function and release orphan chunks when stream ends', () => {
    const incStrNum = (x: string) => String(Number(x) + 1)
    const queue = new QueueMap(incStrNum, 3)
    queue.write('1')
    expect(queue.read(1)).toEqual(null)

    queue.write('2')
    expect(queue.read(1)).toEqual(null)

    queue.end()
    expect(queue.read(1).toString()).toEqual('2')
    expect(queue.read(1).toString()).toEqual('3')
    expect(queue.read(1)).toEqual(null)
  })

  test('should emit ettor when transform function throws', () => {
    const error = new Error('Error inside QueueMap transform function')
    const throws = () => {
      throw error
    }
    const queue = new QueueMap(throws, 3)
    queue.write('1')
    expect(queue.read(1)).toEqual(null)

    queue.write('2')
    expect(queue.read(1)).toEqual(null)

    queue.on('error', (err) => {
      expect(err.message).toEqual(error.message)
      expect(queue.destroyed).toEqual(true)
    })

    queue.end('3')

  })
})

describe('WritablePromise', () => {
  test('should give the recived chunks to the promise', async () => {
    const mockConnectorFn = async (readable: Readable) => {
      let data = ''
      for await (const chunk of readable) {
        data += chunk.toString()
      }
      return data
    }
    const writablePromise = new WritablePromise(
      mockConnectorFn,
      new PassThrough(),
    )
    writablePromise.write('hello')
    writablePromise.write('world')
    writablePromise.end()
    await expect(writablePromise.promise).resolves.toEqual('helloworld')
  })

  test('should handle error inside the promise', async () => {
    const mockThrowingConnectorFnError = new Error('TEST_ERROR_MSG')
    const passthrough = new PassThrough()
    const writablePromise = new WritablePromise(async () => {
      throw mockThrowingConnectorFnError
    }, passthrough)

    const passthroughCloseHandler = jest.fn()
    const passthroughErrorHandler = jest.fn()
    const writablePromiseCloseHandler = jest.fn()
    const writablePromiseErrorHandler = jest.fn()

    passthrough.on('close', passthroughCloseHandler)
    passthrough.on('error', passthroughErrorHandler)
    writablePromise.on('close', writablePromiseCloseHandler)
    writablePromise.on('error', writablePromiseErrorHandler)

    writablePromise.write('hello')
    writablePromise.write('world')

    // Set immidiate to ensure we assert in the "process nextTick"
    setImmediate(() => {
      expect(passthrough.destroyed).toEqual(true)
      expect(passthroughCloseHandler).toHaveBeenCalledTimes(1)
      expect(passthroughErrorHandler).toHaveBeenCalledTimes(1)
      expect(passthroughErrorHandler).toHaveBeenCalledWith(
        mockThrowingConnectorFnError,
      )
      expect(writablePromise.destroyed).toEqual(true)
      expect(writablePromiseCloseHandler).toHaveBeenCalledTimes(1)
      expect(writablePromiseErrorHandler).toHaveBeenCalledTimes(1)
      expect(writablePromiseErrorHandler).toHaveBeenCalledWith(
        mockThrowingConnectorFnError,
      )
    })

    await expect(writablePromise.promise).rejects.toThrow(
      mockThrowingConnectorFnError.message,
    )
  })

  test('should handle rejection inside the promise', async () => {
    const rejectionValue = 'TEST_REJECTION'
    const passthrough = new PassThrough()
    const writablePromise = new WritablePromise(
      async () => Promise.reject(rejectionValue),
      passthrough,
    )

    const passthroughCloseHandler = jest.fn()
    const passthroughErrorHandler = jest.fn()
    const writablePromiseCloseHandler = jest.fn()
    const writablePromiseErrorHandler = jest.fn()

    passthrough.on('close', passthroughCloseHandler)
    passthrough.on('error', passthroughErrorHandler)
    writablePromise.on('close', writablePromiseCloseHandler)
    writablePromise.on('error', writablePromiseErrorHandler)

    writablePromise.write('hello')
    writablePromise.write('world')

    // Set immidiate to ensure we assert in the "process nextTick"
    setImmediate(() => {
      expect(passthrough.destroyed).toEqual(true)
      expect(passthroughCloseHandler).toHaveBeenCalledTimes(1)
      expect(passthroughErrorHandler).toHaveBeenCalledTimes(1)
      expect(passthroughErrorHandler).toHaveBeenCalledWith(rejectionValue)
      expect(writablePromise.destroyed).toEqual(true)
      expect(writablePromiseCloseHandler).toHaveBeenCalledTimes(1)
      expect(writablePromiseErrorHandler).toHaveBeenCalledTimes(1)
      expect(writablePromiseErrorHandler).toHaveBeenCalledWith(rejectionValue)
    })

    await expect(writablePromise.promise).rejects.toEqual(rejectionValue)
  })
})
