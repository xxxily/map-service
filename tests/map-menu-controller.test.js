import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createMapMenuController } from '../src/map/map-menu-controller.js'

class FakeClassList {
  constructor () {
    this.values = new Set()
  }

  toggle (name, force) {
    const next = force === undefined ? !this.values.has(name) : Boolean(force)
    if (next) this.values.add(name)
    else this.values.delete(name)
    return next
  }

  contains (name) {
    return this.values.has(name)
  }
}

class FakeButton {
  constructor (action) {
    this.action = action
    this.attributes = new Map([['data-action', action]])
  }

  getAttribute (name) {
    return this.attributes.get(name) ?? null
  }

  setAttribute (name, value) {
    this.attributes.set(name, String(value))
  }

  closest (selector) {
    return selector === '[data-action]' ? this : null
  }
}

class FakeMenu {
  constructor () {
    this.listeners = new Map()
    this.dataset = {}
    this.classList = new FakeClassList()
    this.moreButton = new FakeButton('toggleLayerControl')
  }

  addEventListener (type, listener) {
    this.listeners.set(type, listener)
  }

  removeEventListener (type, listener) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type)
  }

  querySelector (selector) {
    return selector === '[data-action="toggleLayerControl"]' ? this.moreButton : null
  }

  contains () {
    return true
  }

  click (action) {
    const target = new FakeButton(action)
    this.listeners.get('click')?.({ target })
  }
}

test('map menu handles account and expansion taps before map initialization', () => {
  const menu = new FakeMenu()
  const calls = []
  const controller = createMapMenuController({
    menu,
    handlers: {
      openAccount: () => calls.push('account'),
    },
  })

  menu.click('openAccount')
  menu.click('toggleLayerControl')

  assert.deepEqual(calls, ['account'])
  assert.equal(controller.getToolsExpanded(), true)
  assert.equal(menu.moreButton.getAttribute('aria-expanded'), 'true')
  assert.equal(menu.dataset.mapMenuState, 'initializing')
})

test('map menu replays a dependency action once when its handler becomes ready', () => {
  const menu = new FakeMenu()
  const calls = []
  const controller = createMapMenuController({ menu })

  menu.click('toggleSearchMode')
  menu.click('toggleSearchMode')
  assert.deepEqual(calls, [])

  controller.setAction('toggleSearchMode', ({ replay }) => calls.push({ replay }))
  assert.deepEqual(calls, [{ replay: true }])
})

test('map menu suppresses duplicate clicks while an async action is in flight', async () => {
  const menu = new FakeMenu()
  let resolveAction
  let calls = 0
  const controller = createMapMenuController({
    menu,
    handlers: {
      loadCatalog: () => {
        calls += 1
        return new Promise(resolve => { resolveAction = resolve })
      },
    },
  })

  menu.click('loadCatalog')
  menu.click('loadCatalog')
  assert.equal(calls, 1)
  assert.equal(controller.isBusy('loadCatalog'), true)

  resolveAction()
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(controller.isBusy('loadCatalog'), false)
})
