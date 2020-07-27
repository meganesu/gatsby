/* eslint-disable @typescript-eslint/no-explicit-any */
import { developMachine } from "../develop"
import { interpret } from "xstate"
import { IProgram } from "../../commands/types"

const actions = {
  assignStoreAndWorkerPool: jest.fn(),
  assignServiceResult: jest.fn(),
  callApi: jest.fn(),
  finishParentSpan: jest.fn(),
  saveDbState: jest.fn(),
}

const services = {
  initialize: jest.fn(),
  initializeData: jest.fn(),
  reloadData: jest.fn(),
  runQueries: jest.fn(),
  startWebpackServer: jest.fn(),
  recompile: jest.fn(),
  waitForMutations: jest.fn(),
  recreatePages: jest.fn(),
}

const machine = developMachine.withConfig(
  {
    actions,
    services,
  },
  {
    program: {} as IProgram,
  }
)

const resetMocks = (mocks: Record<string, jest.Mock>): void =>
  Object.values(mocks).forEach(mock => mock.mockReset())

const resetAllMocks = (): void => {
  resetMocks(services)
  resetMocks(actions)
}

describe(`the develop state machine`, () => {
  beforeEach(() => {
    resetAllMocks()
  })

  it(`initialises`, async () => {
    const service = interpret(machine)
    service.start()
    expect(service.state.value).toBe(`initializing`)
  })

  it(`runs node mutation during initialising data state`, () => {
    const payload = { foo: 1 }
    const service = interpret(machine)

    service.start()
    service.send(`done.invoke.initialize`)
    expect(service.state.value).toBe(`initializingData`)
    service.send(`ADD_NODE_MUTATION`, payload)
    expect(actions.callApi).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: `ADD_NODE_MUTATION`, ...payload }),
      expect.anything()
    )
    expect(service.state.context.nodesMutatedDuringQueryRun).toBeTruthy()
  })

  it(`marks source file as dirty during node sourcing`, () => {
    const service = interpret(machine)

    service.start()
    expect(service.state.value).toBe(`initializing`)
    service.send(`done.invoke.initialize`)
    expect(service.state.value).toBe(`initializingData`)
    expect(service.state.context.sourceFilesDirty).toBeFalsy()
    service.send(`SOURCE_FILE_CHANGED`)
    expect(service.state.context.sourceFilesDirty).toBeTruthy()
  })

  // This is current behaviour, but it will be queued in future
  it(`handles a webhook during node sourcing`, () => {
    const webhookBody = { foo: 1 }
    const service = interpret(machine)
    service.start()
    expect(service.state.value).toBe(`initializing`)
    service.send(`done.invoke.initialize`)
    expect(service.state.value).toBe(`initializingData`)
    expect(service.state.context.webhookBody).toBeUndefined()
    service.send(`WEBHOOK_RECEIVED`, { payload: { webhookBody } })
    expect(service.state.context.webhookBody).toEqual(webhookBody)
    expect(services.reloadData).toHaveBeenCalled()
  })

  it(`queues a node mutation during query running`, () => {
    const payload = { foo: 1 }

    const service = interpret(machine)
    service.start()
    service.send(`done.invoke.initialize`)
    service.send(`done.invoke.initialize-data`)
    expect(service.state.context.nodeMutationBatch).toBeUndefined()
    service.send(`ADD_NODE_MUTATION`, { payload })
    expect(service.state.context.nodeMutationBatch).toEqual(
      expect.arrayContaining([payload])
    )
  })

  it(`starts webpack if there is no compiler`, () => {
    const service = interpret(machine)
    service.start()
    service.send(`done.invoke.initialize`)
    service.send(`done.invoke.initialize-data`)
    expect(service.state.context.compiler).toBeUndefined()
    services.startWebpackServer.mockReset()
    service.send(`done.invoke.run-queries`)
    expect(services.startWebpackServer).toHaveBeenCalled()
  })

  it(`recompiles if source files have changed`, () => {
    const service = interpret(machine)
    service.start()
    service.send(`done.invoke.initialize`)
    service.send(`SOURCE_FILE_CHANGED`)

    service.send(`done.invoke.initialize-data`)
    // So we don't start webpack instead
    service.state.context.compiler = {} as any
    services.recompile.mockReset()
    service.send(`done.invoke.run-queries`)
    expect(services.startWebpackServer).not.toHaveBeenCalled()
    expect(services.recompile).toHaveBeenCalled()
  })

  it(`skips compilation if source files are unchanged`, () => {
    const service = interpret(machine)
    service.start()
    service.send(`done.invoke.initialize`)
    service.send(`done.invoke.initialize-data`)
    service.state.context.compiler = {} as any
    services.recompile.mockReset()
    service.send(`done.invoke.run-queries`)
    expect(services.startWebpackServer).not.toHaveBeenCalled()
    expect(services.recompile).not.toHaveBeenCalled()
  })

  it(`recreates pages when waiting is complete`, () => {
    const service = interpret(machine)
    service.start()
    service.send(`done.invoke.initialize`)
    service.send(`done.invoke.initialize-data`)
    service.state.context.compiler = {} as any
    service.send(`done.invoke.run-queries`)
    service.send(`done.invoke.waiting`)

    expect(services.recreatePages).toHaveBeenCalled()
  })

  it(`extracts queries when waiting requests it`, () => {
    const service = interpret(machine)
    service.start()
    service.send(`done.invoke.initialize`)
    service.send(`done.invoke.initialize-data`)
    service.state.context.compiler = {} as any
    service.send(`done.invoke.run-queries`)
    service.send(`EXTRACT_QUERIES_NOW`)
    expect(services.runQueries).toHaveBeenCalled()
  })
})

// const transitionWatcher = jest.fn()
// service.onTransition(transitionWatcher)

// expect(transitionWatcher).toHaveBeenCalledWith({})
