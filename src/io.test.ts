import * as IO from './io'

describe('Laws', () => {
  test('left identity', () => {
    const f = (x: number) => IO.pure(() => x * 2)
    const leftside = IO.bind(f)(IO.pure(10))
    const rightside = f(10)
    const found = IO.show(leftside) === IO.show(rightside)
    const wanted = true

    expect(found).toBe(wanted)
  })

  test('right identity', () => {
    const leftside = IO.bind(IO.pure)(IO.pure(10))
    const rightside = IO.pure(10)
    const found = IO.show(leftside) === IO.show(rightside)
    const wanted = true

    expect(found).toBe(wanted)
  })

  test('associativity', () => {
    const f = (x: number) => IO.pure(x * 2)
    const g = (x: number) => IO.pure(x + 1)
    const leftside = IO.bind(g)(IO.bind(f)(IO.pure(10)))
    const rightside = IO.bind((x: number) => IO.bind(g)(f(x)))(IO.pure(10))
    const found = IO.show(leftside) === IO.show(rightside)
    const wanted = true

    expect(found).toBe(wanted)
  })
})

describe('Functor', () => {
  test('fmap: maps the function over a io value', () => {
    const double = (x: number) => x * 2
    const found = IO.fmap(double)(IO.pure(2))
    const wanted = IO.pure(4)
    expect(IO.show(found)).toBe(IO.show(wanted))
  })
})

describe('Applicative', () => {
  test('pure: wrapps a value in the context', () => {
    const found = IO.pure(2)()
    const wanted = 2
    expect(found).toBe(wanted)
  })

  test('apply: apply the io value to the function', () => {
    const double = (x: number) => x * 2
    const found = IO.apply(IO.pure(2))(IO.pure(double))
    const wanted = IO.pure(4)
    expect(IO.show(found)).toBe(IO.show(wanted))
  })
})

describe('Monad', () => {
  test('bind: apply the io value to a function returning an io, then flatten the result', () => {
    const mDouble = (x: number) => IO.pure(x * 2)
    const found = IO.bind(mDouble)(IO.pure(2))
    const wanted = IO.pure(4)
    expect(IO.show(found)).toBe(IO.show(wanted))
  })
})

// tap.test(
//   'IO map takes a function which lazily works on the return value of the wrapped function',
//   t => {
//     const found = IO(() => 10)
//       .map(x => x * 2)
//       .inspect()
//     const wanted = 'IO(20)'

//     t.equal(found, wanted)
//     t.end()
//   }
// )

// tap.test(
//   'IO chain takes a function which returns a IO type and unwraps one level',
//   t => {
//     const found = IO(() => 3)
//       .chain(x => IO(() => x * 2))
//       .inspect()
//     const wanted = 'IO(6)'

//     t.equal(found, wanted)
//     t.end()
//   }
// )

// tap.test('IO ap applies the value of a IO type to the wrapped function', t => {
//   const found = IO.of(x => y => x * y)
//     .ap(IO.of(3))
//     .ap(IO.of(4))
//     .inspect()
//   const wanted = 'IO(12)'

//   t.equal(found, wanted)
//   t.end()
// })

// tap.test('IO fold takes a function and unwraps the value', t => {
//   const found = IO.of(10).fold(x => x)
//   const wanted = 10

//   t.equal(found, wanted)
//   t.end()
// })
