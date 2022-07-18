function noop() { }
function assign(tar, src) {
    // @ts-ignore
    for (const k in src)
        tar[k] = src[k];
    return tar;
}
function run(fn) {
    return fn();
}
function blank_object() {
    return Object.create(null);
}
function run_all(fns) {
    fns.forEach(run);
}
function is_function(thing) {
    return typeof thing === 'function';
}
function safe_not_equal(a, b) {
    return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
}
function is_empty(obj) {
    return Object.keys(obj).length === 0;
}
function create_slot(definition, ctx, $$scope, fn) {
    if (definition) {
        const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
        return definition[0](slot_ctx);
    }
}
function get_slot_context(definition, ctx, $$scope, fn) {
    return definition[1] && fn
        ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
        : $$scope.ctx;
}
function get_slot_changes(definition, $$scope, dirty, fn) {
    if (definition[2] && fn) {
        const lets = definition[2](fn(dirty));
        if ($$scope.dirty === undefined) {
            return lets;
        }
        if (typeof lets === 'object') {
            const merged = [];
            const len = Math.max($$scope.dirty.length, lets.length);
            for (let i = 0; i < len; i += 1) {
                merged[i] = $$scope.dirty[i] | lets[i];
            }
            return merged;
        }
        return $$scope.dirty | lets;
    }
    return $$scope.dirty;
}
function update_slot_base(slot, slot_definition, ctx, $$scope, slot_changes, get_slot_context_fn) {
    if (slot_changes) {
        const slot_context = get_slot_context(slot_definition, ctx, $$scope, get_slot_context_fn);
        slot.p(slot_context, slot_changes);
    }
}
function get_all_dirty_from_scope($$scope) {
    if ($$scope.ctx.length > 32) {
        const dirty = [];
        const length = $$scope.ctx.length / 32;
        for (let i = 0; i < length; i++) {
            dirty[i] = -1;
        }
        return dirty;
    }
    return -1;
}
function append(target, node) {
    target.appendChild(node);
}
function insert(target, node, anchor) {
    target.insertBefore(node, anchor || null);
}
function detach(node) {
    node.parentNode.removeChild(node);
}
function element(name) {
    return document.createElement(name);
}
function text(data) {
    return document.createTextNode(data);
}
function space() {
    return text(' ');
}
function listen(node, event, handler, options) {
    node.addEventListener(event, handler, options);
    return () => node.removeEventListener(event, handler, options);
}
function attr(node, attribute, value) {
    if (value == null)
        node.removeAttribute(attribute);
    else if (node.getAttribute(attribute) !== value)
        node.setAttribute(attribute, value);
}
function children(element) {
    return Array.from(element.childNodes);
}
function set_data(text, data) {
    data = '' + data;
    if (text.wholeText !== data)
        text.data = data;
}
function custom_event(type, detail, { bubbles = false, cancelable = false } = {}) {
    const e = document.createEvent('CustomEvent');
    e.initCustomEvent(type, bubbles, cancelable, detail);
    return e;
}

let current_component;
function set_current_component(component) {
    current_component = component;
}
function get_current_component() {
    if (!current_component)
        throw new Error('Function called outside component initialization');
    return current_component;
}
function onMount(fn) {
    get_current_component().$$.on_mount.push(fn);
}
function createEventDispatcher() {
    const component = get_current_component();
    return (type, detail, { cancelable = false } = {}) => {
        const callbacks = component.$$.callbacks[type];
        if (callbacks) {
            // TODO are there situations where events could be dispatched
            // in a server (non-DOM) environment?
            const event = custom_event(type, detail, { cancelable });
            callbacks.slice().forEach(fn => {
                fn.call(component, event);
            });
            return !event.defaultPrevented;
        }
        return true;
    };
}

const dirty_components = [];
const binding_callbacks = [];
const render_callbacks = [];
const flush_callbacks = [];
const resolved_promise = Promise.resolve();
let update_scheduled = false;
function schedule_update() {
    if (!update_scheduled) {
        update_scheduled = true;
        resolved_promise.then(flush);
    }
}
function add_render_callback(fn) {
    render_callbacks.push(fn);
}
// flush() calls callbacks in this order:
// 1. All beforeUpdate callbacks, in order: parents before children
// 2. All bind:this callbacks, in reverse order: children before parents.
// 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
//    for afterUpdates called during the initial onMount, which are called in
//    reverse order: children before parents.
// Since callbacks might update component values, which could trigger another
// call to flush(), the following steps guard against this:
// 1. During beforeUpdate, any updated components will be added to the
//    dirty_components array and will cause a reentrant call to flush(). Because
//    the flush index is kept outside the function, the reentrant call will pick
//    up where the earlier call left off and go through all dirty components. The
//    current_component value is saved and restored so that the reentrant call will
//    not interfere with the "parent" flush() call.
// 2. bind:this callbacks cannot trigger new flush() calls.
// 3. During afterUpdate, any updated components will NOT have their afterUpdate
//    callback called a second time; the seen_callbacks set, outside the flush()
//    function, guarantees this behavior.
const seen_callbacks = new Set();
let flushidx = 0; // Do *not* move this inside the flush() function
function flush() {
    const saved_component = current_component;
    do {
        // first, call beforeUpdate functions
        // and update components
        while (flushidx < dirty_components.length) {
            const component = dirty_components[flushidx];
            flushidx++;
            set_current_component(component);
            update$1(component.$$);
        }
        set_current_component(null);
        dirty_components.length = 0;
        flushidx = 0;
        while (binding_callbacks.length)
            binding_callbacks.pop()();
        // then, once components are updated, call
        // afterUpdate functions. This may cause
        // subsequent updates...
        for (let i = 0; i < render_callbacks.length; i += 1) {
            const callback = render_callbacks[i];
            if (!seen_callbacks.has(callback)) {
                // ...so guard against infinite loops
                seen_callbacks.add(callback);
                callback();
            }
        }
        render_callbacks.length = 0;
    } while (dirty_components.length);
    while (flush_callbacks.length) {
        flush_callbacks.pop()();
    }
    update_scheduled = false;
    seen_callbacks.clear();
    set_current_component(saved_component);
}
function update$1($$) {
    if ($$.fragment !== null) {
        $$.update();
        run_all($$.before_update);
        const dirty = $$.dirty;
        $$.dirty = [-1];
        $$.fragment && $$.fragment.p($$.ctx, dirty);
        $$.after_update.forEach(add_render_callback);
    }
}
const outroing = new Set();
let outros;
function transition_in(block, local) {
    if (block && block.i) {
        outroing.delete(block);
        block.i(local);
    }
}
function transition_out(block, local, detach, callback) {
    if (block && block.o) {
        if (outroing.has(block))
            return;
        outroing.add(block);
        outros.c.push(() => {
            outroing.delete(block);
            if (callback) {
                if (detach)
                    block.d(1);
                callback();
            }
        });
        block.o(local);
    }
    else if (callback) {
        callback();
    }
}
function create_component(block) {
    block && block.c();
}
function mount_component(component, target, anchor, customElement) {
    const { fragment, on_mount, on_destroy, after_update } = component.$$;
    fragment && fragment.m(target, anchor);
    if (!customElement) {
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
    }
    after_update.forEach(add_render_callback);
}
function destroy_component(component, detaching) {
    const $$ = component.$$;
    if ($$.fragment !== null) {
        run_all($$.on_destroy);
        $$.fragment && $$.fragment.d(detaching);
        // TODO null out other refs, including component.$$ (but need to
        // preserve final state?)
        $$.on_destroy = $$.fragment = null;
        $$.ctx = [];
    }
}
function make_dirty(component, i) {
    if (component.$$.dirty[0] === -1) {
        dirty_components.push(component);
        schedule_update();
        component.$$.dirty.fill(0);
    }
    component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
}
function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
    const parent_component = current_component;
    set_current_component(component);
    const $$ = component.$$ = {
        fragment: null,
        ctx: null,
        // state
        props,
        update: noop,
        not_equal,
        bound: blank_object(),
        // lifecycle
        on_mount: [],
        on_destroy: [],
        on_disconnect: [],
        before_update: [],
        after_update: [],
        context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
        // everything else
        callbacks: blank_object(),
        dirty,
        skip_bound: false,
        root: options.target || parent_component.$$.root
    };
    append_styles && append_styles($$.root);
    let ready = false;
    $$.ctx = instance
        ? instance(component, options.props || {}, (i, ret, ...rest) => {
            const value = rest.length ? rest[0] : ret;
            if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                if (!$$.skip_bound && $$.bound[i])
                    $$.bound[i](value);
                if (ready)
                    make_dirty(component, i);
            }
            return ret;
        })
        : [];
    $$.update();
    ready = true;
    run_all($$.before_update);
    // `false` as a special case of no DOM component
    $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
    if (options.target) {
        if (options.hydrate) {
            const nodes = children(options.target);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.l(nodes);
            nodes.forEach(detach);
        }
        else {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.c();
        }
        if (options.intro)
            transition_in(component.$$.fragment);
        mount_component(component, options.target, options.anchor, options.customElement);
        flush();
    }
    set_current_component(parent_component);
}
/**
 * Base class for Svelte components. Used when dev=false.
 */
class SvelteComponent {
    $destroy() {
        destroy_component(this, 1);
        this.$destroy = noop;
    }
    $on(type, callback) {
        const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
        callbacks.push(callback);
        return () => {
            const index = callbacks.indexOf(callback);
            if (index !== -1)
                callbacks.splice(index, 1);
        };
    }
    $set($$props) {
        if (this.$$set && !is_empty($$props)) {
            this.$$.skip_bound = true;
            this.$$set($$props);
            this.$$.skip_bound = false;
        }
    }
}

const rnd = (() => {
  const gen = (min, max) => max++ && [...Array(max-min)].map((s, i) => String.fromCharCode(min+i));

  const sets = {
      num: gen(48,57),
      alphaLower: gen(97,122),
      alphaUpper: gen(65,90),
      special: [...`~!@#$%^&*()_+-=[]\{}|;:'",./<>?`]
  };

  function* iter(len, set) {
      if (set.length < 1) set = Object.values(sets).flat(); 
      for (let i = 0; i < len; i++) yield set[Math.random() * set.length|0];
  }

  return Object.assign(((len, ...set) => [...iter(len, set.flat())].join('')), sets);
})();

/* src/components/modal.svelte generated by Svelte v3.49.0 */

function create_if_block(ctx) {
	let div;
	let button;
	let t1;
	let mounted;
	let dispose;
	let if_block = /*cancel*/ ctx[3] && create_if_block_1(ctx);

	return {
		c() {
			div = element("div");
			button = element("button");
			button.textContent = "OK";
			t1 = space();
			if (if_block) if_block.c();
			attr(button, "class", "btn");
			attr(div, "class", "modal-action");
		},
		m(target, anchor) {
			insert(target, div, anchor);
			append(div, button);
			append(div, t1);
			if (if_block) if_block.m(div, null);

			if (!mounted) {
				dispose = listen(button, "click", /*okClick*/ ctx[4]);
				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (/*cancel*/ ctx[3]) {
				if (if_block) {
					if_block.p(ctx, dirty);
				} else {
					if_block = create_if_block_1(ctx);
					if_block.c();
					if_block.m(div, null);
				}
			} else if (if_block) {
				if_block.d(1);
				if_block = null;
			}
		},
		d(detaching) {
			if (detaching) detach(div);
			if (if_block) if_block.d();
			mounted = false;
			dispose();
		}
	};
}

// (29:8) {#if cancel}
function create_if_block_1(ctx) {
	let button;
	let mounted;
	let dispose;

	return {
		c() {
			button = element("button");
			button.textContent = "Cancel";
			attr(button, "class", "btn btn-outline");
		},
		m(target, anchor) {
			insert(target, button, anchor);

			if (!mounted) {
				dispose = listen(button, "click", /*cancelClick*/ ctx[5]);
				mounted = true;
			}
		},
		p: noop,
		d(detaching) {
			if (detaching) detach(button);
			mounted = false;
			dispose();
		}
	};
}

function create_fragment$1(ctx) {
	let input;
	let t0;
	let div1;
	let div0;
	let t1;
	let current;
	let mounted;
	let dispose;
	const default_slot_template = /*#slots*/ ctx[7].default;
	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[6], null);
	let if_block = /*ok*/ ctx[2] && create_if_block(ctx);

	return {
		c() {
			input = element("input");
			t0 = space();
			div1 = element("div");
			div0 = element("div");
			if (default_slot) default_slot.c();
			t1 = space();
			if (if_block) if_block.c();
			attr(input, "type", "checkbox");
			attr(input, "id", /*id*/ ctx[1]);
			attr(input, "class", "modal-toggle");
			attr(div0, "class", "modal-box");
			attr(div1, "class", "modal");
		},
		m(target, anchor) {
			insert(target, input, anchor);
			input.checked = /*open*/ ctx[0];
			insert(target, t0, anchor);
			insert(target, div1, anchor);
			append(div1, div0);

			if (default_slot) {
				default_slot.m(div0, null);
			}

			append(div0, t1);
			if (if_block) if_block.m(div0, null);
			current = true;

			if (!mounted) {
				dispose = listen(input, "change", /*input_change_handler*/ ctx[8]);
				mounted = true;
			}
		},
		p(ctx, [dirty]) {
			if (!current || dirty & /*id*/ 2) {
				attr(input, "id", /*id*/ ctx[1]);
			}

			if (dirty & /*open*/ 1) {
				input.checked = /*open*/ ctx[0];
			}

			if (default_slot) {
				if (default_slot.p && (!current || dirty & /*$$scope*/ 64)) {
					update_slot_base(
						default_slot,
						default_slot_template,
						ctx,
						/*$$scope*/ ctx[6],
						!current
						? get_all_dirty_from_scope(/*$$scope*/ ctx[6])
						: get_slot_changes(default_slot_template, /*$$scope*/ ctx[6], dirty, null),
						null
					);
				}
			}

			if (/*ok*/ ctx[2]) {
				if (if_block) {
					if_block.p(ctx, dirty);
				} else {
					if_block = create_if_block(ctx);
					if_block.c();
					if_block.m(div0, null);
				}
			} else if (if_block) {
				if_block.d(1);
				if_block = null;
			}
		},
		i(local) {
			if (current) return;
			transition_in(default_slot, local);
			current = true;
		},
		o(local) {
			transition_out(default_slot, local);
			current = false;
		},
		d(detaching) {
			if (detaching) detach(input);
			if (detaching) detach(t0);
			if (detaching) detach(div1);
			if (default_slot) default_slot.d(detaching);
			if (if_block) if_block.d();
			mounted = false;
			dispose();
		}
	};
}

function instance$1($$self, $$props, $$invalidate) {
	let { $$slots: slots = {}, $$scope } = $$props;
	let { id = rnd(20, rnd.alphaLower) } = $$props;
	let { open = false } = $$props;
	let { ok = true } = $$props;
	let { cancel = false } = $$props;
	const dispatch = createEventDispatcher();

	function okClick() {
		$$invalidate(0, open = false);
		dispatch("click");
	}

	function cancelClick() {
		dispatch("cancel");
	}

	function input_change_handler() {
		open = this.checked;
		$$invalidate(0, open);
	}

	$$self.$$set = $$props => {
		if ('id' in $$props) $$invalidate(1, id = $$props.id);
		if ('open' in $$props) $$invalidate(0, open = $$props.open);
		if ('ok' in $$props) $$invalidate(2, ok = $$props.ok);
		if ('cancel' in $$props) $$invalidate(3, cancel = $$props.cancel);
		if ('$$scope' in $$props) $$invalidate(6, $$scope = $$props.$$scope);
	};

	return [
		open,
		id,
		ok,
		cancel,
		okClick,
		cancelClick,
		$$scope,
		slots,
		input_change_handler
	];
}

class Modal extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance$1, create_fragment$1, safe_not_equal, { id: 1, open: 0, ok: 2, cancel: 3 });
	}
}

var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

var transaction = {};

var utils$a = {};

var base64Js = {};

base64Js.byteLength = byteLength;
base64Js.toByteArray = toByteArray;
base64Js.fromByteArray = fromByteArray;

var lookup = [];
var revLookup = [];
var Arr = typeof Uint8Array !== 'undefined' ? Uint8Array : Array;

var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
for (var i = 0, len = code.length; i < len; ++i) {
  lookup[i] = code[i];
  revLookup[code.charCodeAt(i)] = i;
}

// Support decoding URL-safe base64 strings, as Node.js does.
// See: https://en.wikipedia.org/wiki/Base64#URL_applications
revLookup['-'.charCodeAt(0)] = 62;
revLookup['_'.charCodeAt(0)] = 63;

function getLens (b64) {
  var len = b64.length;

  if (len % 4 > 0) {
    throw new Error('Invalid string. Length must be a multiple of 4')
  }

  // Trim off extra bytes after placeholder bytes are found
  // See: https://github.com/beatgammit/base64-js/issues/42
  var validLen = b64.indexOf('=');
  if (validLen === -1) validLen = len;

  var placeHoldersLen = validLen === len
    ? 0
    : 4 - (validLen % 4);

  return [validLen, placeHoldersLen]
}

// base64 is 4/3 + up to two characters of the original data
function byteLength (b64) {
  var lens = getLens(b64);
  var validLen = lens[0];
  var placeHoldersLen = lens[1];
  return ((validLen + placeHoldersLen) * 3 / 4) - placeHoldersLen
}

function _byteLength (b64, validLen, placeHoldersLen) {
  return ((validLen + placeHoldersLen) * 3 / 4) - placeHoldersLen
}

function toByteArray (b64) {
  var tmp;
  var lens = getLens(b64);
  var validLen = lens[0];
  var placeHoldersLen = lens[1];

  var arr = new Arr(_byteLength(b64, validLen, placeHoldersLen));

  var curByte = 0;

  // if there are placeholders, only get up to the last complete 4 chars
  var len = placeHoldersLen > 0
    ? validLen - 4
    : validLen;

  var i;
  for (i = 0; i < len; i += 4) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 18) |
      (revLookup[b64.charCodeAt(i + 1)] << 12) |
      (revLookup[b64.charCodeAt(i + 2)] << 6) |
      revLookup[b64.charCodeAt(i + 3)];
    arr[curByte++] = (tmp >> 16) & 0xFF;
    arr[curByte++] = (tmp >> 8) & 0xFF;
    arr[curByte++] = tmp & 0xFF;
  }

  if (placeHoldersLen === 2) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 2) |
      (revLookup[b64.charCodeAt(i + 1)] >> 4);
    arr[curByte++] = tmp & 0xFF;
  }

  if (placeHoldersLen === 1) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 10) |
      (revLookup[b64.charCodeAt(i + 1)] << 4) |
      (revLookup[b64.charCodeAt(i + 2)] >> 2);
    arr[curByte++] = (tmp >> 8) & 0xFF;
    arr[curByte++] = tmp & 0xFF;
  }

  return arr
}

function tripletToBase64 (num) {
  return lookup[num >> 18 & 0x3F] +
    lookup[num >> 12 & 0x3F] +
    lookup[num >> 6 & 0x3F] +
    lookup[num & 0x3F]
}

function encodeChunk (uint8, start, end) {
  var tmp;
  var output = [];
  for (var i = start; i < end; i += 3) {
    tmp =
      ((uint8[i] << 16) & 0xFF0000) +
      ((uint8[i + 1] << 8) & 0xFF00) +
      (uint8[i + 2] & 0xFF);
    output.push(tripletToBase64(tmp));
  }
  return output.join('')
}

function fromByteArray (uint8) {
  var tmp;
  var len = uint8.length;
  var extraBytes = len % 3; // if we have 1 byte left, pad 2 bytes
  var parts = [];
  var maxChunkLength = 16383; // must be multiple of 3

  // go through the array every three bytes, we'll deal with trailing stuff later
  for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
    parts.push(encodeChunk(uint8, i, (i + maxChunkLength) > len2 ? len2 : (i + maxChunkLength)));
  }

  // pad the end with zeros, but make sure to not forget the extra bytes
  if (extraBytes === 1) {
    tmp = uint8[len - 1];
    parts.push(
      lookup[tmp >> 2] +
      lookup[(tmp << 4) & 0x3F] +
      '=='
    );
  } else if (extraBytes === 2) {
    tmp = (uint8[len - 2] << 8) + uint8[len - 1];
    parts.push(
      lookup[tmp >> 10] +
      lookup[(tmp >> 4) & 0x3F] +
      lookup[(tmp << 2) & 0x3F] +
      '='
    );
  }

  return parts.join('')
}

var util = {};

var types = {};

var shams$1;
var hasRequiredShams$1;

function requireShams$1 () {
	if (hasRequiredShams$1) return shams$1;
	hasRequiredShams$1 = 1;

	/* eslint complexity: [2, 18], max-statements: [2, 33] */
	shams$1 = function hasSymbols() {
		if (typeof Symbol !== 'function' || typeof Object.getOwnPropertySymbols !== 'function') { return false; }
		if (typeof Symbol.iterator === 'symbol') { return true; }

		var obj = {};
		var sym = Symbol('test');
		var symObj = Object(sym);
		if (typeof sym === 'string') { return false; }

		if (Object.prototype.toString.call(sym) !== '[object Symbol]') { return false; }
		if (Object.prototype.toString.call(symObj) !== '[object Symbol]') { return false; }

		// temp disabled per https://github.com/ljharb/object.assign/issues/17
		// if (sym instanceof Symbol) { return false; }
		// temp disabled per https://github.com/WebReflection/get-own-property-symbols/issues/4
		// if (!(symObj instanceof Symbol)) { return false; }

		// if (typeof Symbol.prototype.toString !== 'function') { return false; }
		// if (String(sym) !== Symbol.prototype.toString.call(sym)) { return false; }

		var symVal = 42;
		obj[sym] = symVal;
		for (sym in obj) { return false; } // eslint-disable-line no-restricted-syntax, no-unreachable-loop
		if (typeof Object.keys === 'function' && Object.keys(obj).length !== 0) { return false; }

		if (typeof Object.getOwnPropertyNames === 'function' && Object.getOwnPropertyNames(obj).length !== 0) { return false; }

		var syms = Object.getOwnPropertySymbols(obj);
		if (syms.length !== 1 || syms[0] !== sym) { return false; }

		if (!Object.prototype.propertyIsEnumerable.call(obj, sym)) { return false; }

		if (typeof Object.getOwnPropertyDescriptor === 'function') {
			var descriptor = Object.getOwnPropertyDescriptor(obj, sym);
			if (descriptor.value !== symVal || descriptor.enumerable !== true) { return false; }
		}

		return true;
	};
	return shams$1;
}

var shams;
var hasRequiredShams;

function requireShams () {
	if (hasRequiredShams) return shams;
	hasRequiredShams = 1;

	var hasSymbols = requireShams$1();

	shams = function hasToStringTagShams() {
		return hasSymbols() && !!Symbol.toStringTag;
	};
	return shams;
}

var hasSymbols;
var hasRequiredHasSymbols;

function requireHasSymbols () {
	if (hasRequiredHasSymbols) return hasSymbols;
	hasRequiredHasSymbols = 1;

	var origSymbol = typeof Symbol !== 'undefined' && Symbol;
	var hasSymbolSham = requireShams$1();

	hasSymbols = function hasNativeSymbols() {
		if (typeof origSymbol !== 'function') { return false; }
		if (typeof Symbol !== 'function') { return false; }
		if (typeof origSymbol('foo') !== 'symbol') { return false; }
		if (typeof Symbol('bar') !== 'symbol') { return false; }

		return hasSymbolSham();
	};
	return hasSymbols;
}

var implementation;
var hasRequiredImplementation;

function requireImplementation () {
	if (hasRequiredImplementation) return implementation;
	hasRequiredImplementation = 1;

	/* eslint no-invalid-this: 1 */

	var ERROR_MESSAGE = 'Function.prototype.bind called on incompatible ';
	var slice = Array.prototype.slice;
	var toStr = Object.prototype.toString;
	var funcType = '[object Function]';

	implementation = function bind(that) {
	    var target = this;
	    if (typeof target !== 'function' || toStr.call(target) !== funcType) {
	        throw new TypeError(ERROR_MESSAGE + target);
	    }
	    var args = slice.call(arguments, 1);

	    var bound;
	    var binder = function () {
	        if (this instanceof bound) {
	            var result = target.apply(
	                this,
	                args.concat(slice.call(arguments))
	            );
	            if (Object(result) === result) {
	                return result;
	            }
	            return this;
	        } else {
	            return target.apply(
	                that,
	                args.concat(slice.call(arguments))
	            );
	        }
	    };

	    var boundLength = Math.max(0, target.length - args.length);
	    var boundArgs = [];
	    for (var i = 0; i < boundLength; i++) {
	        boundArgs.push('$' + i);
	    }

	    bound = Function('binder', 'return function (' + boundArgs.join(',') + '){ return binder.apply(this,arguments); }')(binder);

	    if (target.prototype) {
	        var Empty = function Empty() {};
	        Empty.prototype = target.prototype;
	        bound.prototype = new Empty();
	        Empty.prototype = null;
	    }

	    return bound;
	};
	return implementation;
}

var functionBind;
var hasRequiredFunctionBind;

function requireFunctionBind () {
	if (hasRequiredFunctionBind) return functionBind;
	hasRequiredFunctionBind = 1;

	var implementation = requireImplementation();

	functionBind = Function.prototype.bind || implementation;
	return functionBind;
}

var src;
var hasRequiredSrc;

function requireSrc () {
	if (hasRequiredSrc) return src;
	hasRequiredSrc = 1;

	var bind = requireFunctionBind();

	src = bind.call(Function.call, Object.prototype.hasOwnProperty);
	return src;
}

var getIntrinsic;
var hasRequiredGetIntrinsic;

function requireGetIntrinsic () {
	if (hasRequiredGetIntrinsic) return getIntrinsic;
	hasRequiredGetIntrinsic = 1;

	var undefined$1;

	var $SyntaxError = SyntaxError;
	var $Function = Function;
	var $TypeError = TypeError;

	// eslint-disable-next-line consistent-return
	var getEvalledConstructor = function (expressionSyntax) {
		try {
			return $Function('"use strict"; return (' + expressionSyntax + ').constructor;')();
		} catch (e) {}
	};

	var $gOPD = Object.getOwnPropertyDescriptor;
	if ($gOPD) {
		try {
			$gOPD({}, '');
		} catch (e) {
			$gOPD = null; // this is IE 8, which has a broken gOPD
		}
	}

	var throwTypeError = function () {
		throw new $TypeError();
	};
	var ThrowTypeError = $gOPD
		? (function () {
			try {
				// eslint-disable-next-line no-unused-expressions, no-caller, no-restricted-properties
				arguments.callee; // IE 8 does not throw here
				return throwTypeError;
			} catch (calleeThrows) {
				try {
					// IE 8 throws on Object.getOwnPropertyDescriptor(arguments, '')
					return $gOPD(arguments, 'callee').get;
				} catch (gOPDthrows) {
					return throwTypeError;
				}
			}
		}())
		: throwTypeError;

	var hasSymbols = requireHasSymbols()();

	var getProto = Object.getPrototypeOf || function (x) { return x.__proto__; }; // eslint-disable-line no-proto

	var needsEval = {};

	var TypedArray = typeof Uint8Array === 'undefined' ? undefined$1 : getProto(Uint8Array);

	var INTRINSICS = {
		'%AggregateError%': typeof AggregateError === 'undefined' ? undefined$1 : AggregateError,
		'%Array%': Array,
		'%ArrayBuffer%': typeof ArrayBuffer === 'undefined' ? undefined$1 : ArrayBuffer,
		'%ArrayIteratorPrototype%': hasSymbols ? getProto([][Symbol.iterator]()) : undefined$1,
		'%AsyncFromSyncIteratorPrototype%': undefined$1,
		'%AsyncFunction%': needsEval,
		'%AsyncGenerator%': needsEval,
		'%AsyncGeneratorFunction%': needsEval,
		'%AsyncIteratorPrototype%': needsEval,
		'%Atomics%': typeof Atomics === 'undefined' ? undefined$1 : Atomics,
		'%BigInt%': typeof BigInt === 'undefined' ? undefined$1 : BigInt,
		'%Boolean%': Boolean,
		'%DataView%': typeof DataView === 'undefined' ? undefined$1 : DataView,
		'%Date%': Date,
		'%decodeURI%': decodeURI,
		'%decodeURIComponent%': decodeURIComponent,
		'%encodeURI%': encodeURI,
		'%encodeURIComponent%': encodeURIComponent,
		'%Error%': Error,
		'%eval%': eval, // eslint-disable-line no-eval
		'%EvalError%': EvalError,
		'%Float32Array%': typeof Float32Array === 'undefined' ? undefined$1 : Float32Array,
		'%Float64Array%': typeof Float64Array === 'undefined' ? undefined$1 : Float64Array,
		'%FinalizationRegistry%': typeof FinalizationRegistry === 'undefined' ? undefined$1 : FinalizationRegistry,
		'%Function%': $Function,
		'%GeneratorFunction%': needsEval,
		'%Int8Array%': typeof Int8Array === 'undefined' ? undefined$1 : Int8Array,
		'%Int16Array%': typeof Int16Array === 'undefined' ? undefined$1 : Int16Array,
		'%Int32Array%': typeof Int32Array === 'undefined' ? undefined$1 : Int32Array,
		'%isFinite%': isFinite,
		'%isNaN%': isNaN,
		'%IteratorPrototype%': hasSymbols ? getProto(getProto([][Symbol.iterator]())) : undefined$1,
		'%JSON%': typeof JSON === 'object' ? JSON : undefined$1,
		'%Map%': typeof Map === 'undefined' ? undefined$1 : Map,
		'%MapIteratorPrototype%': typeof Map === 'undefined' || !hasSymbols ? undefined$1 : getProto(new Map()[Symbol.iterator]()),
		'%Math%': Math,
		'%Number%': Number,
		'%Object%': Object,
		'%parseFloat%': parseFloat,
		'%parseInt%': parseInt,
		'%Promise%': typeof Promise === 'undefined' ? undefined$1 : Promise,
		'%Proxy%': typeof Proxy === 'undefined' ? undefined$1 : Proxy,
		'%RangeError%': RangeError,
		'%ReferenceError%': ReferenceError,
		'%Reflect%': typeof Reflect === 'undefined' ? undefined$1 : Reflect,
		'%RegExp%': RegExp,
		'%Set%': typeof Set === 'undefined' ? undefined$1 : Set,
		'%SetIteratorPrototype%': typeof Set === 'undefined' || !hasSymbols ? undefined$1 : getProto(new Set()[Symbol.iterator]()),
		'%SharedArrayBuffer%': typeof SharedArrayBuffer === 'undefined' ? undefined$1 : SharedArrayBuffer,
		'%String%': String,
		'%StringIteratorPrototype%': hasSymbols ? getProto(''[Symbol.iterator]()) : undefined$1,
		'%Symbol%': hasSymbols ? Symbol : undefined$1,
		'%SyntaxError%': $SyntaxError,
		'%ThrowTypeError%': ThrowTypeError,
		'%TypedArray%': TypedArray,
		'%TypeError%': $TypeError,
		'%Uint8Array%': typeof Uint8Array === 'undefined' ? undefined$1 : Uint8Array,
		'%Uint8ClampedArray%': typeof Uint8ClampedArray === 'undefined' ? undefined$1 : Uint8ClampedArray,
		'%Uint16Array%': typeof Uint16Array === 'undefined' ? undefined$1 : Uint16Array,
		'%Uint32Array%': typeof Uint32Array === 'undefined' ? undefined$1 : Uint32Array,
		'%URIError%': URIError,
		'%WeakMap%': typeof WeakMap === 'undefined' ? undefined$1 : WeakMap,
		'%WeakRef%': typeof WeakRef === 'undefined' ? undefined$1 : WeakRef,
		'%WeakSet%': typeof WeakSet === 'undefined' ? undefined$1 : WeakSet
	};

	var doEval = function doEval(name) {
		var value;
		if (name === '%AsyncFunction%') {
			value = getEvalledConstructor('async function () {}');
		} else if (name === '%GeneratorFunction%') {
			value = getEvalledConstructor('function* () {}');
		} else if (name === '%AsyncGeneratorFunction%') {
			value = getEvalledConstructor('async function* () {}');
		} else if (name === '%AsyncGenerator%') {
			var fn = doEval('%AsyncGeneratorFunction%');
			if (fn) {
				value = fn.prototype;
			}
		} else if (name === '%AsyncIteratorPrototype%') {
			var gen = doEval('%AsyncGenerator%');
			if (gen) {
				value = getProto(gen.prototype);
			}
		}

		INTRINSICS[name] = value;

		return value;
	};

	var LEGACY_ALIASES = {
		'%ArrayBufferPrototype%': ['ArrayBuffer', 'prototype'],
		'%ArrayPrototype%': ['Array', 'prototype'],
		'%ArrayProto_entries%': ['Array', 'prototype', 'entries'],
		'%ArrayProto_forEach%': ['Array', 'prototype', 'forEach'],
		'%ArrayProto_keys%': ['Array', 'prototype', 'keys'],
		'%ArrayProto_values%': ['Array', 'prototype', 'values'],
		'%AsyncFunctionPrototype%': ['AsyncFunction', 'prototype'],
		'%AsyncGenerator%': ['AsyncGeneratorFunction', 'prototype'],
		'%AsyncGeneratorPrototype%': ['AsyncGeneratorFunction', 'prototype', 'prototype'],
		'%BooleanPrototype%': ['Boolean', 'prototype'],
		'%DataViewPrototype%': ['DataView', 'prototype'],
		'%DatePrototype%': ['Date', 'prototype'],
		'%ErrorPrototype%': ['Error', 'prototype'],
		'%EvalErrorPrototype%': ['EvalError', 'prototype'],
		'%Float32ArrayPrototype%': ['Float32Array', 'prototype'],
		'%Float64ArrayPrototype%': ['Float64Array', 'prototype'],
		'%FunctionPrototype%': ['Function', 'prototype'],
		'%Generator%': ['GeneratorFunction', 'prototype'],
		'%GeneratorPrototype%': ['GeneratorFunction', 'prototype', 'prototype'],
		'%Int8ArrayPrototype%': ['Int8Array', 'prototype'],
		'%Int16ArrayPrototype%': ['Int16Array', 'prototype'],
		'%Int32ArrayPrototype%': ['Int32Array', 'prototype'],
		'%JSONParse%': ['JSON', 'parse'],
		'%JSONStringify%': ['JSON', 'stringify'],
		'%MapPrototype%': ['Map', 'prototype'],
		'%NumberPrototype%': ['Number', 'prototype'],
		'%ObjectPrototype%': ['Object', 'prototype'],
		'%ObjProto_toString%': ['Object', 'prototype', 'toString'],
		'%ObjProto_valueOf%': ['Object', 'prototype', 'valueOf'],
		'%PromisePrototype%': ['Promise', 'prototype'],
		'%PromiseProto_then%': ['Promise', 'prototype', 'then'],
		'%Promise_all%': ['Promise', 'all'],
		'%Promise_reject%': ['Promise', 'reject'],
		'%Promise_resolve%': ['Promise', 'resolve'],
		'%RangeErrorPrototype%': ['RangeError', 'prototype'],
		'%ReferenceErrorPrototype%': ['ReferenceError', 'prototype'],
		'%RegExpPrototype%': ['RegExp', 'prototype'],
		'%SetPrototype%': ['Set', 'prototype'],
		'%SharedArrayBufferPrototype%': ['SharedArrayBuffer', 'prototype'],
		'%StringPrototype%': ['String', 'prototype'],
		'%SymbolPrototype%': ['Symbol', 'prototype'],
		'%SyntaxErrorPrototype%': ['SyntaxError', 'prototype'],
		'%TypedArrayPrototype%': ['TypedArray', 'prototype'],
		'%TypeErrorPrototype%': ['TypeError', 'prototype'],
		'%Uint8ArrayPrototype%': ['Uint8Array', 'prototype'],
		'%Uint8ClampedArrayPrototype%': ['Uint8ClampedArray', 'prototype'],
		'%Uint16ArrayPrototype%': ['Uint16Array', 'prototype'],
		'%Uint32ArrayPrototype%': ['Uint32Array', 'prototype'],
		'%URIErrorPrototype%': ['URIError', 'prototype'],
		'%WeakMapPrototype%': ['WeakMap', 'prototype'],
		'%WeakSetPrototype%': ['WeakSet', 'prototype']
	};

	var bind = requireFunctionBind();
	var hasOwn = requireSrc();
	var $concat = bind.call(Function.call, Array.prototype.concat);
	var $spliceApply = bind.call(Function.apply, Array.prototype.splice);
	var $replace = bind.call(Function.call, String.prototype.replace);
	var $strSlice = bind.call(Function.call, String.prototype.slice);
	var $exec = bind.call(Function.call, RegExp.prototype.exec);

	/* adapted from https://github.com/lodash/lodash/blob/4.17.15/dist/lodash.js#L6735-L6744 */
	var rePropName = /[^%.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|%$))/g;
	var reEscapeChar = /\\(\\)?/g; /** Used to match backslashes in property paths. */
	var stringToPath = function stringToPath(string) {
		var first = $strSlice(string, 0, 1);
		var last = $strSlice(string, -1);
		if (first === '%' && last !== '%') {
			throw new $SyntaxError('invalid intrinsic syntax, expected closing `%`');
		} else if (last === '%' && first !== '%') {
			throw new $SyntaxError('invalid intrinsic syntax, expected opening `%`');
		}
		var result = [];
		$replace(string, rePropName, function (match, number, quote, subString) {
			result[result.length] = quote ? $replace(subString, reEscapeChar, '$1') : number || match;
		});
		return result;
	};
	/* end adaptation */

	var getBaseIntrinsic = function getBaseIntrinsic(name, allowMissing) {
		var intrinsicName = name;
		var alias;
		if (hasOwn(LEGACY_ALIASES, intrinsicName)) {
			alias = LEGACY_ALIASES[intrinsicName];
			intrinsicName = '%' + alias[0] + '%';
		}

		if (hasOwn(INTRINSICS, intrinsicName)) {
			var value = INTRINSICS[intrinsicName];
			if (value === needsEval) {
				value = doEval(intrinsicName);
			}
			if (typeof value === 'undefined' && !allowMissing) {
				throw new $TypeError('intrinsic ' + name + ' exists, but is not available. Please file an issue!');
			}

			return {
				alias: alias,
				name: intrinsicName,
				value: value
			};
		}

		throw new $SyntaxError('intrinsic ' + name + ' does not exist!');
	};

	getIntrinsic = function GetIntrinsic(name, allowMissing) {
		if (typeof name !== 'string' || name.length === 0) {
			throw new $TypeError('intrinsic name must be a non-empty string');
		}
		if (arguments.length > 1 && typeof allowMissing !== 'boolean') {
			throw new $TypeError('"allowMissing" argument must be a boolean');
		}

		if ($exec(/^%?[^%]*%?$/g, name) === null) {
			throw new $SyntaxError('`%` may not be present anywhere but at the beginning and end of the intrinsic name');
		}
		var parts = stringToPath(name);
		var intrinsicBaseName = parts.length > 0 ? parts[0] : '';

		var intrinsic = getBaseIntrinsic('%' + intrinsicBaseName + '%', allowMissing);
		var intrinsicRealName = intrinsic.name;
		var value = intrinsic.value;
		var skipFurtherCaching = false;

		var alias = intrinsic.alias;
		if (alias) {
			intrinsicBaseName = alias[0];
			$spliceApply(parts, $concat([0, 1], alias));
		}

		for (var i = 1, isOwn = true; i < parts.length; i += 1) {
			var part = parts[i];
			var first = $strSlice(part, 0, 1);
			var last = $strSlice(part, -1);
			if (
				(
					(first === '"' || first === "'" || first === '`')
					|| (last === '"' || last === "'" || last === '`')
				)
				&& first !== last
			) {
				throw new $SyntaxError('property names with quotes must have matching quotes');
			}
			if (part === 'constructor' || !isOwn) {
				skipFurtherCaching = true;
			}

			intrinsicBaseName += '.' + part;
			intrinsicRealName = '%' + intrinsicBaseName + '%';

			if (hasOwn(INTRINSICS, intrinsicRealName)) {
				value = INTRINSICS[intrinsicRealName];
			} else if (value != null) {
				if (!(part in value)) {
					if (!allowMissing) {
						throw new $TypeError('base intrinsic for ' + name + ' exists, but the property is not available.');
					}
					return void undefined$1;
				}
				if ($gOPD && (i + 1) >= parts.length) {
					var desc = $gOPD(value, part);
					isOwn = !!desc;

					// By convention, when a data property is converted to an accessor
					// property to emulate a data property that does not suffer from
					// the override mistake, that accessor's getter is marked with
					// an `originalValue` property. Here, when we detect this, we
					// uphold the illusion by pretending to see that original data
					// property, i.e., returning the value rather than the getter
					// itself.
					if (isOwn && 'get' in desc && !('originalValue' in desc.get)) {
						value = desc.get;
					} else {
						value = value[part];
					}
				} else {
					isOwn = hasOwn(value, part);
					value = value[part];
				}

				if (isOwn && !skipFurtherCaching) {
					INTRINSICS[intrinsicRealName] = value;
				}
			}
		}
		return value;
	};
	return getIntrinsic;
}

var callBind = {exports: {}};

var hasRequiredCallBind;

function requireCallBind () {
	if (hasRequiredCallBind) return callBind.exports;
	hasRequiredCallBind = 1;
	(function (module) {

		var bind = requireFunctionBind();
		var GetIntrinsic = requireGetIntrinsic();

		var $apply = GetIntrinsic('%Function.prototype.apply%');
		var $call = GetIntrinsic('%Function.prototype.call%');
		var $reflectApply = GetIntrinsic('%Reflect.apply%', true) || bind.call($call, $apply);

		var $gOPD = GetIntrinsic('%Object.getOwnPropertyDescriptor%', true);
		var $defineProperty = GetIntrinsic('%Object.defineProperty%', true);
		var $max = GetIntrinsic('%Math.max%');

		if ($defineProperty) {
			try {
				$defineProperty({}, 'a', { value: 1 });
			} catch (e) {
				// IE 8 has a broken defineProperty
				$defineProperty = null;
			}
		}

		module.exports = function callBind(originalFunction) {
			var func = $reflectApply(bind, $call, arguments);
			if ($gOPD && $defineProperty) {
				var desc = $gOPD(func, 'length');
				if (desc.configurable) {
					// original length, plus the receiver, minus any additional arguments (after the receiver)
					$defineProperty(
						func,
						'length',
						{ value: 1 + $max(0, originalFunction.length - (arguments.length - 1)) }
					);
				}
			}
			return func;
		};

		var applyBind = function applyBind() {
			return $reflectApply(bind, $apply, arguments);
		};

		if ($defineProperty) {
			$defineProperty(module.exports, 'apply', { value: applyBind });
		} else {
			module.exports.apply = applyBind;
		}
} (callBind));
	return callBind.exports;
}

var callBound;
var hasRequiredCallBound;

function requireCallBound () {
	if (hasRequiredCallBound) return callBound;
	hasRequiredCallBound = 1;

	var GetIntrinsic = requireGetIntrinsic();

	var callBind = requireCallBind();

	var $indexOf = callBind(GetIntrinsic('String.prototype.indexOf'));

	callBound = function callBoundIntrinsic(name, allowMissing) {
		var intrinsic = GetIntrinsic(name, !!allowMissing);
		if (typeof intrinsic === 'function' && $indexOf(name, '.prototype.') > -1) {
			return callBind(intrinsic);
		}
		return intrinsic;
	};
	return callBound;
}

var isArguments;
var hasRequiredIsArguments;

function requireIsArguments () {
	if (hasRequiredIsArguments) return isArguments;
	hasRequiredIsArguments = 1;

	var hasToStringTag = requireShams()();
	var callBound = requireCallBound();

	var $toString = callBound('Object.prototype.toString');

	var isStandardArguments = function isArguments(value) {
		if (hasToStringTag && value && typeof value === 'object' && Symbol.toStringTag in value) {
			return false;
		}
		return $toString(value) === '[object Arguments]';
	};

	var isLegacyArguments = function isArguments(value) {
		if (isStandardArguments(value)) {
			return true;
		}
		return value !== null &&
			typeof value === 'object' &&
			typeof value.length === 'number' &&
			value.length >= 0 &&
			$toString(value) !== '[object Array]' &&
			$toString(value.callee) === '[object Function]';
	};

	var supportsStandardArguments = (function () {
		return isStandardArguments(arguments);
	}());

	isStandardArguments.isLegacyArguments = isLegacyArguments; // for tests

	isArguments = supportsStandardArguments ? isStandardArguments : isLegacyArguments;
	return isArguments;
}

var isGeneratorFunction;
var hasRequiredIsGeneratorFunction;

function requireIsGeneratorFunction () {
	if (hasRequiredIsGeneratorFunction) return isGeneratorFunction;
	hasRequiredIsGeneratorFunction = 1;

	var toStr = Object.prototype.toString;
	var fnToStr = Function.prototype.toString;
	var isFnRegex = /^\s*(?:function)?\*/;
	var hasToStringTag = requireShams()();
	var getProto = Object.getPrototypeOf;
	var getGeneratorFunc = function () { // eslint-disable-line consistent-return
		if (!hasToStringTag) {
			return false;
		}
		try {
			return Function('return function*() {}')();
		} catch (e) {
		}
	};
	var GeneratorFunction;

	isGeneratorFunction = function isGeneratorFunction(fn) {
		if (typeof fn !== 'function') {
			return false;
		}
		if (isFnRegex.test(fnToStr.call(fn))) {
			return true;
		}
		if (!hasToStringTag) {
			var str = toStr.call(fn);
			return str === '[object GeneratorFunction]';
		}
		if (!getProto) {
			return false;
		}
		if (typeof GeneratorFunction === 'undefined') {
			var generatorFunc = getGeneratorFunc();
			GeneratorFunction = generatorFunc ? getProto(generatorFunc) : false;
		}
		return getProto(fn) === GeneratorFunction;
	};
	return isGeneratorFunction;
}

var isCallable;
var hasRequiredIsCallable;

function requireIsCallable () {
	if (hasRequiredIsCallable) return isCallable;
	hasRequiredIsCallable = 1;

	var fnToStr = Function.prototype.toString;
	var reflectApply = typeof Reflect === 'object' && Reflect !== null && Reflect.apply;
	var badArrayLike;
	var isCallableMarker;
	if (typeof reflectApply === 'function' && typeof Object.defineProperty === 'function') {
		try {
			badArrayLike = Object.defineProperty({}, 'length', {
				get: function () {
					throw isCallableMarker;
				}
			});
			isCallableMarker = {};
			// eslint-disable-next-line no-throw-literal
			reflectApply(function () { throw 42; }, null, badArrayLike);
		} catch (_) {
			if (_ !== isCallableMarker) {
				reflectApply = null;
			}
		}
	} else {
		reflectApply = null;
	}

	var constructorRegex = /^\s*class\b/;
	var isES6ClassFn = function isES6ClassFunction(value) {
		try {
			var fnStr = fnToStr.call(value);
			return constructorRegex.test(fnStr);
		} catch (e) {
			return false; // not a function
		}
	};

	var tryFunctionObject = function tryFunctionToStr(value) {
		try {
			if (isES6ClassFn(value)) { return false; }
			fnToStr.call(value);
			return true;
		} catch (e) {
			return false;
		}
	};
	var toStr = Object.prototype.toString;
	var fnClass = '[object Function]';
	var genClass = '[object GeneratorFunction]';
	var hasToStringTag = typeof Symbol === 'function' && !!Symbol.toStringTag; // better: use `has-tostringtag`
	/* globals document: false */
	var documentDotAll = typeof document === 'object' && typeof document.all === 'undefined' && document.all !== undefined ? document.all : {};

	isCallable = reflectApply
		? function isCallable(value) {
			if (value === documentDotAll) { return true; }
			if (!value) { return false; }
			if (typeof value !== 'function' && typeof value !== 'object') { return false; }
			if (typeof value === 'function' && !value.prototype) { return true; }
			try {
				reflectApply(value, null, badArrayLike);
			} catch (e) {
				if (e !== isCallableMarker) { return false; }
			}
			return !isES6ClassFn(value);
		}
		: function isCallable(value) {
			if (value === documentDotAll) { return true; }
			if (!value) { return false; }
			if (typeof value !== 'function' && typeof value !== 'object') { return false; }
			if (typeof value === 'function' && !value.prototype) { return true; }
			if (hasToStringTag) { return tryFunctionObject(value); }
			if (isES6ClassFn(value)) { return false; }
			var strClass = toStr.call(value);
			return strClass === fnClass || strClass === genClass;
		};
	return isCallable;
}

var forEach_1;
var hasRequiredForEach;

function requireForEach () {
	if (hasRequiredForEach) return forEach_1;
	hasRequiredForEach = 1;

	var isCallable = requireIsCallable();

	var toStr = Object.prototype.toString;
	var hasOwnProperty = Object.prototype.hasOwnProperty;

	var forEachArray = function forEachArray(array, iterator, receiver) {
	    for (var i = 0, len = array.length; i < len; i++) {
	        if (hasOwnProperty.call(array, i)) {
	            if (receiver == null) {
	                iterator(array[i], i, array);
	            } else {
	                iterator.call(receiver, array[i], i, array);
	            }
	        }
	    }
	};

	var forEachString = function forEachString(string, iterator, receiver) {
	    for (var i = 0, len = string.length; i < len; i++) {
	        // no such thing as a sparse string.
	        if (receiver == null) {
	            iterator(string.charAt(i), i, string);
	        } else {
	            iterator.call(receiver, string.charAt(i), i, string);
	        }
	    }
	};

	var forEachObject = function forEachObject(object, iterator, receiver) {
	    for (var k in object) {
	        if (hasOwnProperty.call(object, k)) {
	            if (receiver == null) {
	                iterator(object[k], k, object);
	            } else {
	                iterator.call(receiver, object[k], k, object);
	            }
	        }
	    }
	};

	var forEach = function forEach(list, iterator, thisArg) {
	    if (!isCallable(iterator)) {
	        throw new TypeError('iterator must be a function');
	    }

	    var receiver;
	    if (arguments.length >= 3) {
	        receiver = thisArg;
	    }

	    if (toStr.call(list) === '[object Array]') {
	        forEachArray(list, iterator, receiver);
	    } else if (typeof list === 'string') {
	        forEachString(list, iterator, receiver);
	    } else {
	        forEachObject(list, iterator, receiver);
	    }
	};

	forEach_1 = forEach;
	return forEach_1;
}

var availableTypedArrays;
var hasRequiredAvailableTypedArrays;

function requireAvailableTypedArrays () {
	if (hasRequiredAvailableTypedArrays) return availableTypedArrays;
	hasRequiredAvailableTypedArrays = 1;

	var possibleNames = [
		'BigInt64Array',
		'BigUint64Array',
		'Float32Array',
		'Float64Array',
		'Int16Array',
		'Int32Array',
		'Int8Array',
		'Uint16Array',
		'Uint32Array',
		'Uint8Array',
		'Uint8ClampedArray'
	];

	var g = typeof globalThis === 'undefined' ? commonjsGlobal : globalThis;

	availableTypedArrays = function availableTypedArrays() {
		var out = [];
		for (var i = 0; i < possibleNames.length; i++) {
			if (typeof g[possibleNames[i]] === 'function') {
				out[out.length] = possibleNames[i];
			}
		}
		return out;
	};
	return availableTypedArrays;
}

var getOwnPropertyDescriptor;
var hasRequiredGetOwnPropertyDescriptor;

function requireGetOwnPropertyDescriptor () {
	if (hasRequiredGetOwnPropertyDescriptor) return getOwnPropertyDescriptor;
	hasRequiredGetOwnPropertyDescriptor = 1;

	var GetIntrinsic = requireGetIntrinsic();

	var $gOPD = GetIntrinsic('%Object.getOwnPropertyDescriptor%', true);
	if ($gOPD) {
		try {
			$gOPD([], 'length');
		} catch (e) {
			// IE 8 has a broken gOPD
			$gOPD = null;
		}
	}

	getOwnPropertyDescriptor = $gOPD;
	return getOwnPropertyDescriptor;
}

var isTypedArray$1;
var hasRequiredIsTypedArray;

function requireIsTypedArray () {
	if (hasRequiredIsTypedArray) return isTypedArray$1;
	hasRequiredIsTypedArray = 1;

	var forEach = requireForEach();
	var availableTypedArrays = requireAvailableTypedArrays();
	var callBound = requireCallBound();

	var $toString = callBound('Object.prototype.toString');
	var hasToStringTag = requireShams()();

	var g = typeof globalThis === 'undefined' ? commonjsGlobal : globalThis;
	var typedArrays = availableTypedArrays();

	var $indexOf = callBound('Array.prototype.indexOf', true) || function indexOf(array, value) {
		for (var i = 0; i < array.length; i += 1) {
			if (array[i] === value) {
				return i;
			}
		}
		return -1;
	};
	var $slice = callBound('String.prototype.slice');
	var toStrTags = {};
	var gOPD = requireGetOwnPropertyDescriptor();
	var getPrototypeOf = Object.getPrototypeOf; // require('getprototypeof');
	if (hasToStringTag && gOPD && getPrototypeOf) {
		forEach(typedArrays, function (typedArray) {
			var arr = new g[typedArray]();
			if (Symbol.toStringTag in arr) {
				var proto = getPrototypeOf(arr);
				var descriptor = gOPD(proto, Symbol.toStringTag);
				if (!descriptor) {
					var superProto = getPrototypeOf(proto);
					descriptor = gOPD(superProto, Symbol.toStringTag);
				}
				toStrTags[typedArray] = descriptor.get;
			}
		});
	}

	var tryTypedArrays = function tryAllTypedArrays(value) {
		var anyTrue = false;
		forEach(toStrTags, function (getter, typedArray) {
			if (!anyTrue) {
				try {
					anyTrue = getter.call(value) === typedArray;
				} catch (e) { /**/ }
			}
		});
		return anyTrue;
	};

	isTypedArray$1 = function isTypedArray(value) {
		if (!value || typeof value !== 'object') { return false; }
		if (!hasToStringTag || !(Symbol.toStringTag in value)) {
			var tag = $slice($toString(value), 8, -1);
			return $indexOf(typedArrays, tag) > -1;
		}
		if (!gOPD) { return false; }
		return tryTypedArrays(value);
	};
	return isTypedArray$1;
}

var whichTypedArray;
var hasRequiredWhichTypedArray;

function requireWhichTypedArray () {
	if (hasRequiredWhichTypedArray) return whichTypedArray;
	hasRequiredWhichTypedArray = 1;

	var forEach = requireForEach();
	var availableTypedArrays = requireAvailableTypedArrays();
	var callBound = requireCallBound();

	var $toString = callBound('Object.prototype.toString');
	var hasToStringTag = requireShams()();

	var g = typeof globalThis === 'undefined' ? commonjsGlobal : globalThis;
	var typedArrays = availableTypedArrays();

	var $slice = callBound('String.prototype.slice');
	var toStrTags = {};
	var gOPD = requireGetOwnPropertyDescriptor();
	var getPrototypeOf = Object.getPrototypeOf; // require('getprototypeof');
	if (hasToStringTag && gOPD && getPrototypeOf) {
		forEach(typedArrays, function (typedArray) {
			if (typeof g[typedArray] === 'function') {
				var arr = new g[typedArray]();
				if (Symbol.toStringTag in arr) {
					var proto = getPrototypeOf(arr);
					var descriptor = gOPD(proto, Symbol.toStringTag);
					if (!descriptor) {
						var superProto = getPrototypeOf(proto);
						descriptor = gOPD(superProto, Symbol.toStringTag);
					}
					toStrTags[typedArray] = descriptor.get;
				}
			}
		});
	}

	var tryTypedArrays = function tryAllTypedArrays(value) {
		var foundName = false;
		forEach(toStrTags, function (getter, typedArray) {
			if (!foundName) {
				try {
					var name = getter.call(value);
					if (name === typedArray) {
						foundName = name;
					}
				} catch (e) {}
			}
		});
		return foundName;
	};

	var isTypedArray = requireIsTypedArray();

	whichTypedArray = function whichTypedArray(value) {
		if (!isTypedArray(value)) { return false; }
		if (!hasToStringTag || !(Symbol.toStringTag in value)) { return $slice($toString(value), 8, -1); }
		return tryTypedArrays(value);
	};
	return whichTypedArray;
}

var hasRequiredTypes;

function requireTypes () {
	if (hasRequiredTypes) return types;
	hasRequiredTypes = 1;
	(function (exports) {

		var isArgumentsObject = requireIsArguments();
		var isGeneratorFunction = requireIsGeneratorFunction();
		var whichTypedArray = requireWhichTypedArray();
		var isTypedArray = requireIsTypedArray();

		function uncurryThis(f) {
		  return f.call.bind(f);
		}

		var BigIntSupported = typeof BigInt !== 'undefined';
		var SymbolSupported = typeof Symbol !== 'undefined';

		var ObjectToString = uncurryThis(Object.prototype.toString);

		var numberValue = uncurryThis(Number.prototype.valueOf);
		var stringValue = uncurryThis(String.prototype.valueOf);
		var booleanValue = uncurryThis(Boolean.prototype.valueOf);

		if (BigIntSupported) {
		  var bigIntValue = uncurryThis(BigInt.prototype.valueOf);
		}

		if (SymbolSupported) {
		  var symbolValue = uncurryThis(Symbol.prototype.valueOf);
		}

		function checkBoxedPrimitive(value, prototypeValueOf) {
		  if (typeof value !== 'object') {
		    return false;
		  }
		  try {
		    prototypeValueOf(value);
		    return true;
		  } catch(e) {
		    return false;
		  }
		}

		exports.isArgumentsObject = isArgumentsObject;
		exports.isGeneratorFunction = isGeneratorFunction;
		exports.isTypedArray = isTypedArray;

		// Taken from here and modified for better browser support
		// https://github.com/sindresorhus/p-is-promise/blob/cda35a513bda03f977ad5cde3a079d237e82d7ef/index.js
		function isPromise(input) {
			return (
				(
					typeof Promise !== 'undefined' &&
					input instanceof Promise
				) ||
				(
					input !== null &&
					typeof input === 'object' &&
					typeof input.then === 'function' &&
					typeof input.catch === 'function'
				)
			);
		}
		exports.isPromise = isPromise;

		function isArrayBufferView(value) {
		  if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView) {
		    return ArrayBuffer.isView(value);
		  }

		  return (
		    isTypedArray(value) ||
		    isDataView(value)
		  );
		}
		exports.isArrayBufferView = isArrayBufferView;


		function isUint8Array(value) {
		  return whichTypedArray(value) === 'Uint8Array';
		}
		exports.isUint8Array = isUint8Array;

		function isUint8ClampedArray(value) {
		  return whichTypedArray(value) === 'Uint8ClampedArray';
		}
		exports.isUint8ClampedArray = isUint8ClampedArray;

		function isUint16Array(value) {
		  return whichTypedArray(value) === 'Uint16Array';
		}
		exports.isUint16Array = isUint16Array;

		function isUint32Array(value) {
		  return whichTypedArray(value) === 'Uint32Array';
		}
		exports.isUint32Array = isUint32Array;

		function isInt8Array(value) {
		  return whichTypedArray(value) === 'Int8Array';
		}
		exports.isInt8Array = isInt8Array;

		function isInt16Array(value) {
		  return whichTypedArray(value) === 'Int16Array';
		}
		exports.isInt16Array = isInt16Array;

		function isInt32Array(value) {
		  return whichTypedArray(value) === 'Int32Array';
		}
		exports.isInt32Array = isInt32Array;

		function isFloat32Array(value) {
		  return whichTypedArray(value) === 'Float32Array';
		}
		exports.isFloat32Array = isFloat32Array;

		function isFloat64Array(value) {
		  return whichTypedArray(value) === 'Float64Array';
		}
		exports.isFloat64Array = isFloat64Array;

		function isBigInt64Array(value) {
		  return whichTypedArray(value) === 'BigInt64Array';
		}
		exports.isBigInt64Array = isBigInt64Array;

		function isBigUint64Array(value) {
		  return whichTypedArray(value) === 'BigUint64Array';
		}
		exports.isBigUint64Array = isBigUint64Array;

		function isMapToString(value) {
		  return ObjectToString(value) === '[object Map]';
		}
		isMapToString.working = (
		  typeof Map !== 'undefined' &&
		  isMapToString(new Map())
		);

		function isMap(value) {
		  if (typeof Map === 'undefined') {
		    return false;
		  }

		  return isMapToString.working
		    ? isMapToString(value)
		    : value instanceof Map;
		}
		exports.isMap = isMap;

		function isSetToString(value) {
		  return ObjectToString(value) === '[object Set]';
		}
		isSetToString.working = (
		  typeof Set !== 'undefined' &&
		  isSetToString(new Set())
		);
		function isSet(value) {
		  if (typeof Set === 'undefined') {
		    return false;
		  }

		  return isSetToString.working
		    ? isSetToString(value)
		    : value instanceof Set;
		}
		exports.isSet = isSet;

		function isWeakMapToString(value) {
		  return ObjectToString(value) === '[object WeakMap]';
		}
		isWeakMapToString.working = (
		  typeof WeakMap !== 'undefined' &&
		  isWeakMapToString(new WeakMap())
		);
		function isWeakMap(value) {
		  if (typeof WeakMap === 'undefined') {
		    return false;
		  }

		  return isWeakMapToString.working
		    ? isWeakMapToString(value)
		    : value instanceof WeakMap;
		}
		exports.isWeakMap = isWeakMap;

		function isWeakSetToString(value) {
		  return ObjectToString(value) === '[object WeakSet]';
		}
		isWeakSetToString.working = (
		  typeof WeakSet !== 'undefined' &&
		  isWeakSetToString(new WeakSet())
		);
		function isWeakSet(value) {
		  return isWeakSetToString(value);
		}
		exports.isWeakSet = isWeakSet;

		function isArrayBufferToString(value) {
		  return ObjectToString(value) === '[object ArrayBuffer]';
		}
		isArrayBufferToString.working = (
		  typeof ArrayBuffer !== 'undefined' &&
		  isArrayBufferToString(new ArrayBuffer())
		);
		function isArrayBuffer(value) {
		  if (typeof ArrayBuffer === 'undefined') {
		    return false;
		  }

		  return isArrayBufferToString.working
		    ? isArrayBufferToString(value)
		    : value instanceof ArrayBuffer;
		}
		exports.isArrayBuffer = isArrayBuffer;

		function isDataViewToString(value) {
		  return ObjectToString(value) === '[object DataView]';
		}
		isDataViewToString.working = (
		  typeof ArrayBuffer !== 'undefined' &&
		  typeof DataView !== 'undefined' &&
		  isDataViewToString(new DataView(new ArrayBuffer(1), 0, 1))
		);
		function isDataView(value) {
		  if (typeof DataView === 'undefined') {
		    return false;
		  }

		  return isDataViewToString.working
		    ? isDataViewToString(value)
		    : value instanceof DataView;
		}
		exports.isDataView = isDataView;

		// Store a copy of SharedArrayBuffer in case it's deleted elsewhere
		var SharedArrayBufferCopy = typeof SharedArrayBuffer !== 'undefined' ? SharedArrayBuffer : undefined;
		function isSharedArrayBufferToString(value) {
		  return ObjectToString(value) === '[object SharedArrayBuffer]';
		}
		function isSharedArrayBuffer(value) {
		  if (typeof SharedArrayBufferCopy === 'undefined') {
		    return false;
		  }

		  if (typeof isSharedArrayBufferToString.working === 'undefined') {
		    isSharedArrayBufferToString.working = isSharedArrayBufferToString(new SharedArrayBufferCopy());
		  }

		  return isSharedArrayBufferToString.working
		    ? isSharedArrayBufferToString(value)
		    : value instanceof SharedArrayBufferCopy;
		}
		exports.isSharedArrayBuffer = isSharedArrayBuffer;

		function isAsyncFunction(value) {
		  return ObjectToString(value) === '[object AsyncFunction]';
		}
		exports.isAsyncFunction = isAsyncFunction;

		function isMapIterator(value) {
		  return ObjectToString(value) === '[object Map Iterator]';
		}
		exports.isMapIterator = isMapIterator;

		function isSetIterator(value) {
		  return ObjectToString(value) === '[object Set Iterator]';
		}
		exports.isSetIterator = isSetIterator;

		function isGeneratorObject(value) {
		  return ObjectToString(value) === '[object Generator]';
		}
		exports.isGeneratorObject = isGeneratorObject;

		function isWebAssemblyCompiledModule(value) {
		  return ObjectToString(value) === '[object WebAssembly.Module]';
		}
		exports.isWebAssemblyCompiledModule = isWebAssemblyCompiledModule;

		function isNumberObject(value) {
		  return checkBoxedPrimitive(value, numberValue);
		}
		exports.isNumberObject = isNumberObject;

		function isStringObject(value) {
		  return checkBoxedPrimitive(value, stringValue);
		}
		exports.isStringObject = isStringObject;

		function isBooleanObject(value) {
		  return checkBoxedPrimitive(value, booleanValue);
		}
		exports.isBooleanObject = isBooleanObject;

		function isBigIntObject(value) {
		  return BigIntSupported && checkBoxedPrimitive(value, bigIntValue);
		}
		exports.isBigIntObject = isBigIntObject;

		function isSymbolObject(value) {
		  return SymbolSupported && checkBoxedPrimitive(value, symbolValue);
		}
		exports.isSymbolObject = isSymbolObject;

		function isBoxedPrimitive(value) {
		  return (
		    isNumberObject(value) ||
		    isStringObject(value) ||
		    isBooleanObject(value) ||
		    isBigIntObject(value) ||
		    isSymbolObject(value)
		  );
		}
		exports.isBoxedPrimitive = isBoxedPrimitive;

		function isAnyArrayBuffer(value) {
		  return typeof Uint8Array !== 'undefined' && (
		    isArrayBuffer(value) ||
		    isSharedArrayBuffer(value)
		  );
		}
		exports.isAnyArrayBuffer = isAnyArrayBuffer;

		['isProxy', 'isExternal', 'isModuleNamespaceObject'].forEach(function(method) {
		  Object.defineProperty(exports, method, {
		    enumerable: false,
		    value: function() {
		      throw new Error(method + ' is not supported in userland');
		    }
		  });
		});
} (types));
	return types;
}

var isBufferBrowser;
var hasRequiredIsBufferBrowser;

function requireIsBufferBrowser () {
	if (hasRequiredIsBufferBrowser) return isBufferBrowser;
	hasRequiredIsBufferBrowser = 1;
	isBufferBrowser = function isBuffer(arg) {
	  return arg && typeof arg === 'object'
	    && typeof arg.copy === 'function'
	    && typeof arg.fill === 'function'
	    && typeof arg.readUInt8 === 'function';
	};
	return isBufferBrowser;
}

var inherits_browser = {exports: {}};

var hasRequiredInherits_browser;

function requireInherits_browser () {
	if (hasRequiredInherits_browser) return inherits_browser.exports;
	hasRequiredInherits_browser = 1;
	if (typeof Object.create === 'function') {
	  // implementation from standard node.js 'util' module
	  inherits_browser.exports = function inherits(ctor, superCtor) {
	    if (superCtor) {
	      ctor.super_ = superCtor;
	      ctor.prototype = Object.create(superCtor.prototype, {
	        constructor: {
	          value: ctor,
	          enumerable: false,
	          writable: true,
	          configurable: true
	        }
	      });
	    }
	  };
	} else {
	  // old school shim for old browsers
	  inherits_browser.exports = function inherits(ctor, superCtor) {
	    if (superCtor) {
	      ctor.super_ = superCtor;
	      var TempCtor = function () {};
	      TempCtor.prototype = superCtor.prototype;
	      ctor.prototype = new TempCtor();
	      ctor.prototype.constructor = ctor;
	    }
	  };
	}
	return inherits_browser.exports;
}

var hasRequiredUtil;

function requireUtil () {
	if (hasRequiredUtil) return util;
	hasRequiredUtil = 1;
	(function (exports) {
		// Copyright Joyent, Inc. and other Node contributors.
		//
		// Permission is hereby granted, free of charge, to any person obtaining a
		// copy of this software and associated documentation files (the
		// "Software"), to deal in the Software without restriction, including
		// without limitation the rights to use, copy, modify, merge, publish,
		// distribute, sublicense, and/or sell copies of the Software, and to permit
		// persons to whom the Software is furnished to do so, subject to the
		// following conditions:
		//
		// The above copyright notice and this permission notice shall be included
		// in all copies or substantial portions of the Software.
		//
		// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
		// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
		// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
		// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
		// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
		// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
		// USE OR OTHER DEALINGS IN THE SOFTWARE.

		var getOwnPropertyDescriptors = Object.getOwnPropertyDescriptors ||
		  function getOwnPropertyDescriptors(obj) {
		    var keys = Object.keys(obj);
		    var descriptors = {};
		    for (var i = 0; i < keys.length; i++) {
		      descriptors[keys[i]] = Object.getOwnPropertyDescriptor(obj, keys[i]);
		    }
		    return descriptors;
		  };

		var formatRegExp = /%[sdj%]/g;
		exports.format = function(f) {
		  if (!isString(f)) {
		    var objects = [];
		    for (var i = 0; i < arguments.length; i++) {
		      objects.push(inspect(arguments[i]));
		    }
		    return objects.join(' ');
		  }

		  var i = 1;
		  var args = arguments;
		  var len = args.length;
		  var str = String(f).replace(formatRegExp, function(x) {
		    if (x === '%%') return '%';
		    if (i >= len) return x;
		    switch (x) {
		      case '%s': return String(args[i++]);
		      case '%d': return Number(args[i++]);
		      case '%j':
		        try {
		          return JSON.stringify(args[i++]);
		        } catch (_) {
		          return '[Circular]';
		        }
		      default:
		        return x;
		    }
		  });
		  for (var x = args[i]; i < len; x = args[++i]) {
		    if (isNull(x) || !isObject(x)) {
		      str += ' ' + x;
		    } else {
		      str += ' ' + inspect(x);
		    }
		  }
		  return str;
		};


		// Mark that a method should not be used.
		// Returns a modified function which warns once by default.
		// If --no-deprecation is set, then it is a no-op.
		exports.deprecate = function(fn, msg) {
		  if (typeof process !== 'undefined' && process.noDeprecation === true) {
		    return fn;
		  }

		  // Allow for deprecating things in the process of starting up.
		  if (typeof process === 'undefined') {
		    return function() {
		      return exports.deprecate(fn, msg).apply(this, arguments);
		    };
		  }

		  var warned = false;
		  function deprecated() {
		    if (!warned) {
		      if (process.throwDeprecation) {
		        throw new Error(msg);
		      } else if (process.traceDeprecation) {
		        console.trace(msg);
		      } else {
		        console.error(msg);
		      }
		      warned = true;
		    }
		    return fn.apply(this, arguments);
		  }

		  return deprecated;
		};


		var debugs = {};
		var debugEnvRegex = /^$/;

		if (process.env.NODE_DEBUG) {
		  var debugEnv = process.env.NODE_DEBUG;
		  debugEnv = debugEnv.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
		    .replace(/\*/g, '.*')
		    .replace(/,/g, '$|^')
		    .toUpperCase();
		  debugEnvRegex = new RegExp('^' + debugEnv + '$', 'i');
		}
		exports.debuglog = function(set) {
		  set = set.toUpperCase();
		  if (!debugs[set]) {
		    if (debugEnvRegex.test(set)) {
		      var pid = process.pid;
		      debugs[set] = function() {
		        var msg = exports.format.apply(exports, arguments);
		        console.error('%s %d: %s', set, pid, msg);
		      };
		    } else {
		      debugs[set] = function() {};
		    }
		  }
		  return debugs[set];
		};


		/**
		 * Echos the value of a value. Trys to print the value out
		 * in the best way possible given the different types.
		 *
		 * @param {Object} obj The object to print out.
		 * @param {Object} opts Optional options object that alters the output.
		 */
		/* legacy: obj, showHidden, depth, colors*/
		function inspect(obj, opts) {
		  // default options
		  var ctx = {
		    seen: [],
		    stylize: stylizeNoColor
		  };
		  // legacy...
		  if (arguments.length >= 3) ctx.depth = arguments[2];
		  if (arguments.length >= 4) ctx.colors = arguments[3];
		  if (isBoolean(opts)) {
		    // legacy...
		    ctx.showHidden = opts;
		  } else if (opts) {
		    // got an "options" object
		    exports._extend(ctx, opts);
		  }
		  // set default options
		  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
		  if (isUndefined(ctx.depth)) ctx.depth = 2;
		  if (isUndefined(ctx.colors)) ctx.colors = false;
		  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
		  if (ctx.colors) ctx.stylize = stylizeWithColor;
		  return formatValue(ctx, obj, ctx.depth);
		}
		exports.inspect = inspect;


		// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
		inspect.colors = {
		  'bold' : [1, 22],
		  'italic' : [3, 23],
		  'underline' : [4, 24],
		  'inverse' : [7, 27],
		  'white' : [37, 39],
		  'grey' : [90, 39],
		  'black' : [30, 39],
		  'blue' : [34, 39],
		  'cyan' : [36, 39],
		  'green' : [32, 39],
		  'magenta' : [35, 39],
		  'red' : [31, 39],
		  'yellow' : [33, 39]
		};

		// Don't use 'blue' not visible on cmd.exe
		inspect.styles = {
		  'special': 'cyan',
		  'number': 'yellow',
		  'boolean': 'yellow',
		  'undefined': 'grey',
		  'null': 'bold',
		  'string': 'green',
		  'date': 'magenta',
		  // "name": intentionally not styling
		  'regexp': 'red'
		};


		function stylizeWithColor(str, styleType) {
		  var style = inspect.styles[styleType];

		  if (style) {
		    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
		           '\u001b[' + inspect.colors[style][1] + 'm';
		  } else {
		    return str;
		  }
		}


		function stylizeNoColor(str, styleType) {
		  return str;
		}


		function arrayToHash(array) {
		  var hash = {};

		  array.forEach(function(val, idx) {
		    hash[val] = true;
		  });

		  return hash;
		}


		function formatValue(ctx, value, recurseTimes) {
		  // Provide a hook for user-specified inspect functions.
		  // Check that value is an object with an inspect function on it
		  if (ctx.customInspect &&
		      value &&
		      isFunction(value.inspect) &&
		      // Filter out the util module, it's inspect function is special
		      value.inspect !== exports.inspect &&
		      // Also filter out any prototype objects using the circular check.
		      !(value.constructor && value.constructor.prototype === value)) {
		    var ret = value.inspect(recurseTimes, ctx);
		    if (!isString(ret)) {
		      ret = formatValue(ctx, ret, recurseTimes);
		    }
		    return ret;
		  }

		  // Primitive types cannot have properties
		  var primitive = formatPrimitive(ctx, value);
		  if (primitive) {
		    return primitive;
		  }

		  // Look up the keys of the object.
		  var keys = Object.keys(value);
		  var visibleKeys = arrayToHash(keys);

		  if (ctx.showHidden) {
		    keys = Object.getOwnPropertyNames(value);
		  }

		  // IE doesn't make error fields non-enumerable
		  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
		  if (isError(value)
		      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
		    return formatError(value);
		  }

		  // Some type of object without properties can be shortcutted.
		  if (keys.length === 0) {
		    if (isFunction(value)) {
		      var name = value.name ? ': ' + value.name : '';
		      return ctx.stylize('[Function' + name + ']', 'special');
		    }
		    if (isRegExp(value)) {
		      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
		    }
		    if (isDate(value)) {
		      return ctx.stylize(Date.prototype.toString.call(value), 'date');
		    }
		    if (isError(value)) {
		      return formatError(value);
		    }
		  }

		  var base = '', array = false, braces = ['{', '}'];

		  // Make Array say that they are Array
		  if (isArray(value)) {
		    array = true;
		    braces = ['[', ']'];
		  }

		  // Make functions say that they are functions
		  if (isFunction(value)) {
		    var n = value.name ? ': ' + value.name : '';
		    base = ' [Function' + n + ']';
		  }

		  // Make RegExps say that they are RegExps
		  if (isRegExp(value)) {
		    base = ' ' + RegExp.prototype.toString.call(value);
		  }

		  // Make dates with properties first say the date
		  if (isDate(value)) {
		    base = ' ' + Date.prototype.toUTCString.call(value);
		  }

		  // Make error with message first say the error
		  if (isError(value)) {
		    base = ' ' + formatError(value);
		  }

		  if (keys.length === 0 && (!array || value.length == 0)) {
		    return braces[0] + base + braces[1];
		  }

		  if (recurseTimes < 0) {
		    if (isRegExp(value)) {
		      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
		    } else {
		      return ctx.stylize('[Object]', 'special');
		    }
		  }

		  ctx.seen.push(value);

		  var output;
		  if (array) {
		    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
		  } else {
		    output = keys.map(function(key) {
		      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
		    });
		  }

		  ctx.seen.pop();

		  return reduceToSingleString(output, base, braces);
		}


		function formatPrimitive(ctx, value) {
		  if (isUndefined(value))
		    return ctx.stylize('undefined', 'undefined');
		  if (isString(value)) {
		    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
		                                             .replace(/'/g, "\\'")
		                                             .replace(/\\"/g, '"') + '\'';
		    return ctx.stylize(simple, 'string');
		  }
		  if (isNumber(value))
		    return ctx.stylize('' + value, 'number');
		  if (isBoolean(value))
		    return ctx.stylize('' + value, 'boolean');
		  // For some reason typeof null is "object", so special case here.
		  if (isNull(value))
		    return ctx.stylize('null', 'null');
		}


		function formatError(value) {
		  return '[' + Error.prototype.toString.call(value) + ']';
		}


		function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
		  var output = [];
		  for (var i = 0, l = value.length; i < l; ++i) {
		    if (hasOwnProperty(value, String(i))) {
		      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
		          String(i), true));
		    } else {
		      output.push('');
		    }
		  }
		  keys.forEach(function(key) {
		    if (!key.match(/^\d+$/)) {
		      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
		          key, true));
		    }
		  });
		  return output;
		}


		function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
		  var name, str, desc;
		  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
		  if (desc.get) {
		    if (desc.set) {
		      str = ctx.stylize('[Getter/Setter]', 'special');
		    } else {
		      str = ctx.stylize('[Getter]', 'special');
		    }
		  } else {
		    if (desc.set) {
		      str = ctx.stylize('[Setter]', 'special');
		    }
		  }
		  if (!hasOwnProperty(visibleKeys, key)) {
		    name = '[' + key + ']';
		  }
		  if (!str) {
		    if (ctx.seen.indexOf(desc.value) < 0) {
		      if (isNull(recurseTimes)) {
		        str = formatValue(ctx, desc.value, null);
		      } else {
		        str = formatValue(ctx, desc.value, recurseTimes - 1);
		      }
		      if (str.indexOf('\n') > -1) {
		        if (array) {
		          str = str.split('\n').map(function(line) {
		            return '  ' + line;
		          }).join('\n').substr(2);
		        } else {
		          str = '\n' + str.split('\n').map(function(line) {
		            return '   ' + line;
		          }).join('\n');
		        }
		      }
		    } else {
		      str = ctx.stylize('[Circular]', 'special');
		    }
		  }
		  if (isUndefined(name)) {
		    if (array && key.match(/^\d+$/)) {
		      return str;
		    }
		    name = JSON.stringify('' + key);
		    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
		      name = name.substr(1, name.length - 2);
		      name = ctx.stylize(name, 'name');
		    } else {
		      name = name.replace(/'/g, "\\'")
		                 .replace(/\\"/g, '"')
		                 .replace(/(^"|"$)/g, "'");
		      name = ctx.stylize(name, 'string');
		    }
		  }

		  return name + ': ' + str;
		}


		function reduceToSingleString(output, base, braces) {
		  var length = output.reduce(function(prev, cur) {
		    if (cur.indexOf('\n') >= 0) ;
		    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
		  }, 0);

		  if (length > 60) {
		    return braces[0] +
		           (base === '' ? '' : base + '\n ') +
		           ' ' +
		           output.join(',\n  ') +
		           ' ' +
		           braces[1];
		  }

		  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
		}


		// NOTE: These type checking functions intentionally don't use `instanceof`
		// because it is fragile and can be easily faked with `Object.create()`.
		exports.types = requireTypes();

		function isArray(ar) {
		  return Array.isArray(ar);
		}
		exports.isArray = isArray;

		function isBoolean(arg) {
		  return typeof arg === 'boolean';
		}
		exports.isBoolean = isBoolean;

		function isNull(arg) {
		  return arg === null;
		}
		exports.isNull = isNull;

		function isNullOrUndefined(arg) {
		  return arg == null;
		}
		exports.isNullOrUndefined = isNullOrUndefined;

		function isNumber(arg) {
		  return typeof arg === 'number';
		}
		exports.isNumber = isNumber;

		function isString(arg) {
		  return typeof arg === 'string';
		}
		exports.isString = isString;

		function isSymbol(arg) {
		  return typeof arg === 'symbol';
		}
		exports.isSymbol = isSymbol;

		function isUndefined(arg) {
		  return arg === void 0;
		}
		exports.isUndefined = isUndefined;

		function isRegExp(re) {
		  return isObject(re) && objectToString(re) === '[object RegExp]';
		}
		exports.isRegExp = isRegExp;
		exports.types.isRegExp = isRegExp;

		function isObject(arg) {
		  return typeof arg === 'object' && arg !== null;
		}
		exports.isObject = isObject;

		function isDate(d) {
		  return isObject(d) && objectToString(d) === '[object Date]';
		}
		exports.isDate = isDate;
		exports.types.isDate = isDate;

		function isError(e) {
		  return isObject(e) &&
		      (objectToString(e) === '[object Error]' || e instanceof Error);
		}
		exports.isError = isError;
		exports.types.isNativeError = isError;

		function isFunction(arg) {
		  return typeof arg === 'function';
		}
		exports.isFunction = isFunction;

		function isPrimitive(arg) {
		  return arg === null ||
		         typeof arg === 'boolean' ||
		         typeof arg === 'number' ||
		         typeof arg === 'string' ||
		         typeof arg === 'symbol' ||  // ES6 symbol
		         typeof arg === 'undefined';
		}
		exports.isPrimitive = isPrimitive;

		exports.isBuffer = requireIsBufferBrowser();

		function objectToString(o) {
		  return Object.prototype.toString.call(o);
		}


		function pad(n) {
		  return n < 10 ? '0' + n.toString(10) : n.toString(10);
		}


		var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
		              'Oct', 'Nov', 'Dec'];

		// 26 Feb 16:19:34
		function timestamp() {
		  var d = new Date();
		  var time = [pad(d.getHours()),
		              pad(d.getMinutes()),
		              pad(d.getSeconds())].join(':');
		  return [d.getDate(), months[d.getMonth()], time].join(' ');
		}


		// log is just a thin wrapper to console.log that prepends a timestamp
		exports.log = function() {
		  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
		};


		/**
		 * Inherit the prototype methods from one constructor into another.
		 *
		 * The Function.prototype.inherits from lang.js rewritten as a standalone
		 * function (not on Function.prototype). NOTE: If this file is to be loaded
		 * during bootstrapping this function needs to be rewritten using some native
		 * functions as prototype setup using normal JavaScript does not work as
		 * expected during bootstrapping (see mirror.js in r114903).
		 *
		 * @param {function} ctor Constructor function which needs to inherit the
		 *     prototype.
		 * @param {function} superCtor Constructor function to inherit prototype from.
		 */
		exports.inherits = requireInherits_browser();

		exports._extend = function(origin, add) {
		  // Don't do anything if add isn't an object
		  if (!add || !isObject(add)) return origin;

		  var keys = Object.keys(add);
		  var i = keys.length;
		  while (i--) {
		    origin[keys[i]] = add[keys[i]];
		  }
		  return origin;
		};

		function hasOwnProperty(obj, prop) {
		  return Object.prototype.hasOwnProperty.call(obj, prop);
		}

		var kCustomPromisifiedSymbol = typeof Symbol !== 'undefined' ? Symbol('util.promisify.custom') : undefined;

		exports.promisify = function promisify(original) {
		  if (typeof original !== 'function')
		    throw new TypeError('The "original" argument must be of type Function');

		  if (kCustomPromisifiedSymbol && original[kCustomPromisifiedSymbol]) {
		    var fn = original[kCustomPromisifiedSymbol];
		    if (typeof fn !== 'function') {
		      throw new TypeError('The "util.promisify.custom" argument must be of type Function');
		    }
		    Object.defineProperty(fn, kCustomPromisifiedSymbol, {
		      value: fn, enumerable: false, writable: false, configurable: true
		    });
		    return fn;
		  }

		  function fn() {
		    var promiseResolve, promiseReject;
		    var promise = new Promise(function (resolve, reject) {
		      promiseResolve = resolve;
		      promiseReject = reject;
		    });

		    var args = [];
		    for (var i = 0; i < arguments.length; i++) {
		      args.push(arguments[i]);
		    }
		    args.push(function (err, value) {
		      if (err) {
		        promiseReject(err);
		      } else {
		        promiseResolve(value);
		      }
		    });

		    try {
		      original.apply(this, args);
		    } catch (err) {
		      promiseReject(err);
		    }

		    return promise;
		  }

		  Object.setPrototypeOf(fn, Object.getPrototypeOf(original));

		  if (kCustomPromisifiedSymbol) Object.defineProperty(fn, kCustomPromisifiedSymbol, {
		    value: fn, enumerable: false, writable: false, configurable: true
		  });
		  return Object.defineProperties(
		    fn,
		    getOwnPropertyDescriptors(original)
		  );
		};

		exports.promisify.custom = kCustomPromisifiedSymbol;

		function callbackifyOnRejected(reason, cb) {
		  // `!reason` guard inspired by bluebird (Ref: https://goo.gl/t5IS6M).
		  // Because `null` is a special error value in callbacks which means "no error
		  // occurred", we error-wrap so the callback consumer can distinguish between
		  // "the promise rejected with null" or "the promise fulfilled with undefined".
		  if (!reason) {
		    var newReason = new Error('Promise was rejected with a falsy value');
		    newReason.reason = reason;
		    reason = newReason;
		  }
		  return cb(reason);
		}

		function callbackify(original) {
		  if (typeof original !== 'function') {
		    throw new TypeError('The "original" argument must be of type Function');
		  }

		  // We DO NOT return the promise as it gives the user a false sense that
		  // the promise is actually somehow related to the callback's execution
		  // and that the callback throwing will reject the promise.
		  function callbackified() {
		    var args = [];
		    for (var i = 0; i < arguments.length; i++) {
		      args.push(arguments[i]);
		    }

		    var maybeCb = args.pop();
		    if (typeof maybeCb !== 'function') {
		      throw new TypeError('The last argument must be of type Function');
		    }
		    var self = this;
		    var cb = function() {
		      return maybeCb.apply(self, arguments);
		    };
		    // In true node style we process the callback on `nextTick` with all the
		    // implications (stack, `uncaughtException`, `async_hooks`)
		    original.apply(this, args)
		      .then(function(ret) { process.nextTick(cb.bind(null, null, ret)); },
		            function(rej) { process.nextTick(callbackifyOnRejected.bind(null, rej, cb)); });
		  }

		  Object.setPrototypeOf(callbackified, Object.getPrototypeOf(original));
		  Object.defineProperties(callbackified,
		                          getOwnPropertyDescriptors(original));
		  return callbackified;
		}
		exports.callbackify = callbackify;
} (util));
	return util;
}

Object.defineProperty(utils$a, "__esModule", { value: true });
utils$a.b64UrlDecode = utils$a.b64UrlEncode = utils$a.bufferTob64Url = utils$a.bufferTob64 = utils$a.b64UrlToBuffer = utils$a.stringToB64Url = utils$a.stringToBuffer = utils$a.bufferToString = utils$a.b64UrlToString = utils$a.concatBuffers = void 0;
const B64js = base64Js;
function concatBuffers(buffers) {
    let total_length = 0;
    for (let i = 0; i < buffers.length; i++) {
        total_length += buffers[i].byteLength;
    }
    let temp = new Uint8Array(total_length);
    let offset = 0;
    temp.set(new Uint8Array(buffers[0]), offset);
    offset += buffers[0].byteLength;
    for (let i = 1; i < buffers.length; i++) {
        temp.set(new Uint8Array(buffers[i]), offset);
        offset += buffers[i].byteLength;
    }
    return temp;
}
utils$a.concatBuffers = concatBuffers;
function b64UrlToString(b64UrlString) {
    let buffer = b64UrlToBuffer(b64UrlString);
    // TextEncoder will be available in browsers, but not in node
    if (typeof TextDecoder == "undefined") {
        const TextDecoder = requireUtil().TextDecoder;
        return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
}
utils$a.b64UrlToString = b64UrlToString;
function bufferToString(buffer) {
    // TextEncoder will be available in browsers, but not in node
    if (typeof TextDecoder == "undefined") {
        const TextDecoder = requireUtil().TextDecoder;
        return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
}
utils$a.bufferToString = bufferToString;
function stringToBuffer(string) {
    // TextEncoder will be available in browsers, but not in node
    if (typeof TextEncoder == "undefined") {
        const TextEncoder = requireUtil().TextEncoder;
        return new TextEncoder().encode(string);
    }
    return new TextEncoder().encode(string);
}
utils$a.stringToBuffer = stringToBuffer;
function stringToB64Url(string) {
    return bufferTob64Url(stringToBuffer(string));
}
utils$a.stringToB64Url = stringToB64Url;
function b64UrlToBuffer(b64UrlString) {
    return new Uint8Array(B64js.toByteArray(b64UrlDecode(b64UrlString)));
}
utils$a.b64UrlToBuffer = b64UrlToBuffer;
function bufferTob64(buffer) {
    return B64js.fromByteArray(new Uint8Array(buffer));
}
utils$a.bufferTob64 = bufferTob64;
function bufferTob64Url(buffer) {
    return b64UrlEncode(bufferTob64(buffer));
}
utils$a.bufferTob64Url = bufferTob64Url;
function b64UrlEncode(b64UrlString) {
    return b64UrlString
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/\=/g, "");
}
utils$a.b64UrlEncode = b64UrlEncode;
function b64UrlDecode(b64UrlString) {
    b64UrlString = b64UrlString.replace(/\-/g, "+").replace(/\_/g, "/");
    let padding;
    b64UrlString.length % 4 == 0
        ? (padding = 0)
        : (padding = 4 - (b64UrlString.length % 4));
    return b64UrlString.concat("=".repeat(padding));
}
utils$a.b64UrlDecode = b64UrlDecode;

var deepHash = {};

var common = {};

var ar = {};

var bignumber = {exports: {}};

(function (module) {
(function (globalObject) {

	/*
	 *      bignumber.js v9.0.2
	 *      A JavaScript library for arbitrary-precision arithmetic.
	 *      https://github.com/MikeMcl/bignumber.js
	 *      Copyright (c) 2021 Michael Mclaughlin <M8ch88l@gmail.com>
	 *      MIT Licensed.
	 *
	 *      BigNumber.prototype methods     |  BigNumber methods
	 *                                      |
	 *      absoluteValue            abs    |  clone
	 *      comparedTo                      |  config               set
	 *      decimalPlaces            dp     |      DECIMAL_PLACES
	 *      dividedBy                div    |      ROUNDING_MODE
	 *      dividedToIntegerBy       idiv   |      EXPONENTIAL_AT
	 *      exponentiatedBy          pow    |      RANGE
	 *      integerValue                    |      CRYPTO
	 *      isEqualTo                eq     |      MODULO_MODE
	 *      isFinite                        |      POW_PRECISION
	 *      isGreaterThan            gt     |      FORMAT
	 *      isGreaterThanOrEqualTo   gte    |      ALPHABET
	 *      isInteger                       |  isBigNumber
	 *      isLessThan               lt     |  maximum              max
	 *      isLessThanOrEqualTo      lte    |  minimum              min
	 *      isNaN                           |  random
	 *      isNegative                      |  sum
	 *      isPositive                      |
	 *      isZero                          |
	 *      minus                           |
	 *      modulo                   mod    |
	 *      multipliedBy             times  |
	 *      negated                         |
	 *      plus                            |
	 *      precision                sd     |
	 *      shiftedBy                       |
	 *      squareRoot               sqrt   |
	 *      toExponential                   |
	 *      toFixed                         |
	 *      toFormat                        |
	 *      toFraction                      |
	 *      toJSON                          |
	 *      toNumber                        |
	 *      toPrecision                     |
	 *      toString                        |
	 *      valueOf                         |
	 *
	 */


	  var BigNumber,
	    isNumeric = /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i,
	    mathceil = Math.ceil,
	    mathfloor = Math.floor,

	    bignumberError = '[BigNumber Error] ',
	    tooManyDigits = bignumberError + 'Number primitive has more than 15 significant digits: ',

	    BASE = 1e14,
	    LOG_BASE = 14,
	    MAX_SAFE_INTEGER = 0x1fffffffffffff,         // 2^53 - 1
	    // MAX_INT32 = 0x7fffffff,                   // 2^31 - 1
	    POWS_TEN = [1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13],
	    SQRT_BASE = 1e7,

	    // EDITABLE
	    // The limit on the value of DECIMAL_PLACES, TO_EXP_NEG, TO_EXP_POS, MIN_EXP, MAX_EXP, and
	    // the arguments to toExponential, toFixed, toFormat, and toPrecision.
	    MAX = 1E9;                                   // 0 to MAX_INT32


	  /*
	   * Create and return a BigNumber constructor.
	   */
	  function clone(configObject) {
	    var div, convertBase, parseNumeric,
	      P = BigNumber.prototype = { constructor: BigNumber, toString: null, valueOf: null },
	      ONE = new BigNumber(1),


	      //----------------------------- EDITABLE CONFIG DEFAULTS -------------------------------


	      // The default values below must be integers within the inclusive ranges stated.
	      // The values can also be changed at run-time using BigNumber.set.

	      // The maximum number of decimal places for operations involving division.
	      DECIMAL_PLACES = 20,                     // 0 to MAX

	      // The rounding mode used when rounding to the above decimal places, and when using
	      // toExponential, toFixed, toFormat and toPrecision, and round (default value).
	      // UP         0 Away from zero.
	      // DOWN       1 Towards zero.
	      // CEIL       2 Towards +Infinity.
	      // FLOOR      3 Towards -Infinity.
	      // HALF_UP    4 Towards nearest neighbour. If equidistant, up.
	      // HALF_DOWN  5 Towards nearest neighbour. If equidistant, down.
	      // HALF_EVEN  6 Towards nearest neighbour. If equidistant, towards even neighbour.
	      // HALF_CEIL  7 Towards nearest neighbour. If equidistant, towards +Infinity.
	      // HALF_FLOOR 8 Towards nearest neighbour. If equidistant, towards -Infinity.
	      ROUNDING_MODE = 4,                       // 0 to 8

	      // EXPONENTIAL_AT : [TO_EXP_NEG , TO_EXP_POS]

	      // The exponent value at and beneath which toString returns exponential notation.
	      // Number type: -7
	      TO_EXP_NEG = -7,                         // 0 to -MAX

	      // The exponent value at and above which toString returns exponential notation.
	      // Number type: 21
	      TO_EXP_POS = 21,                         // 0 to MAX

	      // RANGE : [MIN_EXP, MAX_EXP]

	      // The minimum exponent value, beneath which underflow to zero occurs.
	      // Number type: -324  (5e-324)
	      MIN_EXP = -1e7,                          // -1 to -MAX

	      // The maximum exponent value, above which overflow to Infinity occurs.
	      // Number type:  308  (1.7976931348623157e+308)
	      // For MAX_EXP > 1e7, e.g. new BigNumber('1e100000000').plus(1) may be slow.
	      MAX_EXP = 1e7,                           // 1 to MAX

	      // Whether to use cryptographically-secure random number generation, if available.
	      CRYPTO = false,                          // true or false

	      // The modulo mode used when calculating the modulus: a mod n.
	      // The quotient (q = a / n) is calculated according to the corresponding rounding mode.
	      // The remainder (r) is calculated as: r = a - n * q.
	      //
	      // UP        0 The remainder is positive if the dividend is negative, else is negative.
	      // DOWN      1 The remainder has the same sign as the dividend.
	      //             This modulo mode is commonly known as 'truncated division' and is
	      //             equivalent to (a % n) in JavaScript.
	      // FLOOR     3 The remainder has the same sign as the divisor (Python %).
	      // HALF_EVEN 6 This modulo mode implements the IEEE 754 remainder function.
	      // EUCLID    9 Euclidian division. q = sign(n) * floor(a / abs(n)).
	      //             The remainder is always positive.
	      //
	      // The truncated division, floored division, Euclidian division and IEEE 754 remainder
	      // modes are commonly used for the modulus operation.
	      // Although the other rounding modes can also be used, they may not give useful results.
	      MODULO_MODE = 1,                         // 0 to 9

	      // The maximum number of significant digits of the result of the exponentiatedBy operation.
	      // If POW_PRECISION is 0, there will be unlimited significant digits.
	      POW_PRECISION = 0,                       // 0 to MAX

	      // The format specification used by the BigNumber.prototype.toFormat method.
	      FORMAT = {
	        prefix: '',
	        groupSize: 3,
	        secondaryGroupSize: 0,
	        groupSeparator: ',',
	        decimalSeparator: '.',
	        fractionGroupSize: 0,
	        fractionGroupSeparator: '\xA0',        // non-breaking space
	        suffix: ''
	      },

	      // The alphabet used for base conversion. It must be at least 2 characters long, with no '+',
	      // '-', '.', whitespace, or repeated character.
	      // '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_'
	      ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz',
	      alphabetHasNormalDecimalDigits = true;


	    //------------------------------------------------------------------------------------------


	    // CONSTRUCTOR


	    /*
	     * The BigNumber constructor and exported function.
	     * Create and return a new instance of a BigNumber object.
	     *
	     * v {number|string|BigNumber} A numeric value.
	     * [b] {number} The base of v. Integer, 2 to ALPHABET.length inclusive.
	     */
	    function BigNumber(v, b) {
	      var alphabet, c, caseChanged, e, i, isNum, len, str,
	        x = this;

	      // Enable constructor call without `new`.
	      if (!(x instanceof BigNumber)) return new BigNumber(v, b);

	      if (b == null) {

	        if (v && v._isBigNumber === true) {
	          x.s = v.s;

	          if (!v.c || v.e > MAX_EXP) {
	            x.c = x.e = null;
	          } else if (v.e < MIN_EXP) {
	            x.c = [x.e = 0];
	          } else {
	            x.e = v.e;
	            x.c = v.c.slice();
	          }

	          return;
	        }

	        if ((isNum = typeof v == 'number') && v * 0 == 0) {

	          // Use `1 / n` to handle minus zero also.
	          x.s = 1 / v < 0 ? (v = -v, -1) : 1;

	          // Fast path for integers, where n < 2147483648 (2**31).
	          if (v === ~~v) {
	            for (e = 0, i = v; i >= 10; i /= 10, e++);

	            if (e > MAX_EXP) {
	              x.c = x.e = null;
	            } else {
	              x.e = e;
	              x.c = [v];
	            }

	            return;
	          }

	          str = String(v);
	        } else {

	          if (!isNumeric.test(str = String(v))) return parseNumeric(x, str, isNum);

	          x.s = str.charCodeAt(0) == 45 ? (str = str.slice(1), -1) : 1;
	        }

	        // Decimal point?
	        if ((e = str.indexOf('.')) > -1) str = str.replace('.', '');

	        // Exponential form?
	        if ((i = str.search(/e/i)) > 0) {

	          // Determine exponent.
	          if (e < 0) e = i;
	          e += +str.slice(i + 1);
	          str = str.substring(0, i);
	        } else if (e < 0) {

	          // Integer.
	          e = str.length;
	        }

	      } else {

	        // '[BigNumber Error] Base {not a primitive number|not an integer|out of range}: {b}'
	        intCheck(b, 2, ALPHABET.length, 'Base');

	        // Allow exponential notation to be used with base 10 argument, while
	        // also rounding to DECIMAL_PLACES as with other bases.
	        if (b == 10 && alphabetHasNormalDecimalDigits) {
	          x = new BigNumber(v);
	          return round(x, DECIMAL_PLACES + x.e + 1, ROUNDING_MODE);
	        }

	        str = String(v);

	        if (isNum = typeof v == 'number') {

	          // Avoid potential interpretation of Infinity and NaN as base 44+ values.
	          if (v * 0 != 0) return parseNumeric(x, str, isNum, b);

	          x.s = 1 / v < 0 ? (str = str.slice(1), -1) : 1;

	          // '[BigNumber Error] Number primitive has more than 15 significant digits: {n}'
	          if (BigNumber.DEBUG && str.replace(/^0\.0*|\./, '').length > 15) {
	            throw Error
	             (tooManyDigits + v);
	          }
	        } else {
	          x.s = str.charCodeAt(0) === 45 ? (str = str.slice(1), -1) : 1;
	        }

	        alphabet = ALPHABET.slice(0, b);
	        e = i = 0;

	        // Check that str is a valid base b number.
	        // Don't use RegExp, so alphabet can contain special characters.
	        for (len = str.length; i < len; i++) {
	          if (alphabet.indexOf(c = str.charAt(i)) < 0) {
	            if (c == '.') {

	              // If '.' is not the first character and it has not be found before.
	              if (i > e) {
	                e = len;
	                continue;
	              }
	            } else if (!caseChanged) {

	              // Allow e.g. hexadecimal 'FF' as well as 'ff'.
	              if (str == str.toUpperCase() && (str = str.toLowerCase()) ||
	                  str == str.toLowerCase() && (str = str.toUpperCase())) {
	                caseChanged = true;
	                i = -1;
	                e = 0;
	                continue;
	              }
	            }

	            return parseNumeric(x, String(v), isNum, b);
	          }
	        }

	        // Prevent later check for length on converted number.
	        isNum = false;
	        str = convertBase(str, b, 10, x.s);

	        // Decimal point?
	        if ((e = str.indexOf('.')) > -1) str = str.replace('.', '');
	        else e = str.length;
	      }

	      // Determine leading zeros.
	      for (i = 0; str.charCodeAt(i) === 48; i++);

	      // Determine trailing zeros.
	      for (len = str.length; str.charCodeAt(--len) === 48;);

	      if (str = str.slice(i, ++len)) {
	        len -= i;

	        // '[BigNumber Error] Number primitive has more than 15 significant digits: {n}'
	        if (isNum && BigNumber.DEBUG &&
	          len > 15 && (v > MAX_SAFE_INTEGER || v !== mathfloor(v))) {
	            throw Error
	             (tooManyDigits + (x.s * v));
	        }

	         // Overflow?
	        if ((e = e - i - 1) > MAX_EXP) {

	          // Infinity.
	          x.c = x.e = null;

	        // Underflow?
	        } else if (e < MIN_EXP) {

	          // Zero.
	          x.c = [x.e = 0];
	        } else {
	          x.e = e;
	          x.c = [];

	          // Transform base

	          // e is the base 10 exponent.
	          // i is where to slice str to get the first element of the coefficient array.
	          i = (e + 1) % LOG_BASE;
	          if (e < 0) i += LOG_BASE;  // i < 1

	          if (i < len) {
	            if (i) x.c.push(+str.slice(0, i));

	            for (len -= LOG_BASE; i < len;) {
	              x.c.push(+str.slice(i, i += LOG_BASE));
	            }

	            i = LOG_BASE - (str = str.slice(i)).length;
	          } else {
	            i -= len;
	          }

	          for (; i--; str += '0');
	          x.c.push(+str);
	        }
	      } else {

	        // Zero.
	        x.c = [x.e = 0];
	      }
	    }


	    // CONSTRUCTOR PROPERTIES


	    BigNumber.clone = clone;

	    BigNumber.ROUND_UP = 0;
	    BigNumber.ROUND_DOWN = 1;
	    BigNumber.ROUND_CEIL = 2;
	    BigNumber.ROUND_FLOOR = 3;
	    BigNumber.ROUND_HALF_UP = 4;
	    BigNumber.ROUND_HALF_DOWN = 5;
	    BigNumber.ROUND_HALF_EVEN = 6;
	    BigNumber.ROUND_HALF_CEIL = 7;
	    BigNumber.ROUND_HALF_FLOOR = 8;
	    BigNumber.EUCLID = 9;


	    /*
	     * Configure infrequently-changing library-wide settings.
	     *
	     * Accept an object with the following optional properties (if the value of a property is
	     * a number, it must be an integer within the inclusive range stated):
	     *
	     *   DECIMAL_PLACES   {number}           0 to MAX
	     *   ROUNDING_MODE    {number}           0 to 8
	     *   EXPONENTIAL_AT   {number|number[]}  -MAX to MAX  or  [-MAX to 0, 0 to MAX]
	     *   RANGE            {number|number[]}  -MAX to MAX (not zero)  or  [-MAX to -1, 1 to MAX]
	     *   CRYPTO           {boolean}          true or false
	     *   MODULO_MODE      {number}           0 to 9
	     *   POW_PRECISION       {number}           0 to MAX
	     *   ALPHABET         {string}           A string of two or more unique characters which does
	     *                                       not contain '.'.
	     *   FORMAT           {object}           An object with some of the following properties:
	     *     prefix                 {string}
	     *     groupSize              {number}
	     *     secondaryGroupSize     {number}
	     *     groupSeparator         {string}
	     *     decimalSeparator       {string}
	     *     fractionGroupSize      {number}
	     *     fractionGroupSeparator {string}
	     *     suffix                 {string}
	     *
	     * (The values assigned to the above FORMAT object properties are not checked for validity.)
	     *
	     * E.g.
	     * BigNumber.config({ DECIMAL_PLACES : 20, ROUNDING_MODE : 4 })
	     *
	     * Ignore properties/parameters set to null or undefined, except for ALPHABET.
	     *
	     * Return an object with the properties current values.
	     */
	    BigNumber.config = BigNumber.set = function (obj) {
	      var p, v;

	      if (obj != null) {

	        if (typeof obj == 'object') {

	          // DECIMAL_PLACES {number} Integer, 0 to MAX inclusive.
	          // '[BigNumber Error] DECIMAL_PLACES {not a primitive number|not an integer|out of range}: {v}'
	          if (obj.hasOwnProperty(p = 'DECIMAL_PLACES')) {
	            v = obj[p];
	            intCheck(v, 0, MAX, p);
	            DECIMAL_PLACES = v;
	          }

	          // ROUNDING_MODE {number} Integer, 0 to 8 inclusive.
	          // '[BigNumber Error] ROUNDING_MODE {not a primitive number|not an integer|out of range}: {v}'
	          if (obj.hasOwnProperty(p = 'ROUNDING_MODE')) {
	            v = obj[p];
	            intCheck(v, 0, 8, p);
	            ROUNDING_MODE = v;
	          }

	          // EXPONENTIAL_AT {number|number[]}
	          // Integer, -MAX to MAX inclusive or
	          // [integer -MAX to 0 inclusive, 0 to MAX inclusive].
	          // '[BigNumber Error] EXPONENTIAL_AT {not a primitive number|not an integer|out of range}: {v}'
	          if (obj.hasOwnProperty(p = 'EXPONENTIAL_AT')) {
	            v = obj[p];
	            if (v && v.pop) {
	              intCheck(v[0], -MAX, 0, p);
	              intCheck(v[1], 0, MAX, p);
	              TO_EXP_NEG = v[0];
	              TO_EXP_POS = v[1];
	            } else {
	              intCheck(v, -MAX, MAX, p);
	              TO_EXP_NEG = -(TO_EXP_POS = v < 0 ? -v : v);
	            }
	          }

	          // RANGE {number|number[]} Non-zero integer, -MAX to MAX inclusive or
	          // [integer -MAX to -1 inclusive, integer 1 to MAX inclusive].
	          // '[BigNumber Error] RANGE {not a primitive number|not an integer|out of range|cannot be zero}: {v}'
	          if (obj.hasOwnProperty(p = 'RANGE')) {
	            v = obj[p];
	            if (v && v.pop) {
	              intCheck(v[0], -MAX, -1, p);
	              intCheck(v[1], 1, MAX, p);
	              MIN_EXP = v[0];
	              MAX_EXP = v[1];
	            } else {
	              intCheck(v, -MAX, MAX, p);
	              if (v) {
	                MIN_EXP = -(MAX_EXP = v < 0 ? -v : v);
	              } else {
	                throw Error
	                 (bignumberError + p + ' cannot be zero: ' + v);
	              }
	            }
	          }

	          // CRYPTO {boolean} true or false.
	          // '[BigNumber Error] CRYPTO not true or false: {v}'
	          // '[BigNumber Error] crypto unavailable'
	          if (obj.hasOwnProperty(p = 'CRYPTO')) {
	            v = obj[p];
	            if (v === !!v) {
	              if (v) {
	                if (typeof crypto != 'undefined' && crypto &&
	                 (crypto.getRandomValues || crypto.randomBytes)) {
	                  CRYPTO = v;
	                } else {
	                  CRYPTO = !v;
	                  throw Error
	                   (bignumberError + 'crypto unavailable');
	                }
	              } else {
	                CRYPTO = v;
	              }
	            } else {
	              throw Error
	               (bignumberError + p + ' not true or false: ' + v);
	            }
	          }

	          // MODULO_MODE {number} Integer, 0 to 9 inclusive.
	          // '[BigNumber Error] MODULO_MODE {not a primitive number|not an integer|out of range}: {v}'
	          if (obj.hasOwnProperty(p = 'MODULO_MODE')) {
	            v = obj[p];
	            intCheck(v, 0, 9, p);
	            MODULO_MODE = v;
	          }

	          // POW_PRECISION {number} Integer, 0 to MAX inclusive.
	          // '[BigNumber Error] POW_PRECISION {not a primitive number|not an integer|out of range}: {v}'
	          if (obj.hasOwnProperty(p = 'POW_PRECISION')) {
	            v = obj[p];
	            intCheck(v, 0, MAX, p);
	            POW_PRECISION = v;
	          }

	          // FORMAT {object}
	          // '[BigNumber Error] FORMAT not an object: {v}'
	          if (obj.hasOwnProperty(p = 'FORMAT')) {
	            v = obj[p];
	            if (typeof v == 'object') FORMAT = v;
	            else throw Error
	             (bignumberError + p + ' not an object: ' + v);
	          }

	          // ALPHABET {string}
	          // '[BigNumber Error] ALPHABET invalid: {v}'
	          if (obj.hasOwnProperty(p = 'ALPHABET')) {
	            v = obj[p];

	            // Disallow if less than two characters,
	            // or if it contains '+', '-', '.', whitespace, or a repeated character.
	            if (typeof v == 'string' && !/^.?$|[+\-.\s]|(.).*\1/.test(v)) {
	              alphabetHasNormalDecimalDigits = v.slice(0, 10) == '0123456789';
	              ALPHABET = v;
	            } else {
	              throw Error
	               (bignumberError + p + ' invalid: ' + v);
	            }
	          }

	        } else {

	          // '[BigNumber Error] Object expected: {v}'
	          throw Error
	           (bignumberError + 'Object expected: ' + obj);
	        }
	      }

	      return {
	        DECIMAL_PLACES: DECIMAL_PLACES,
	        ROUNDING_MODE: ROUNDING_MODE,
	        EXPONENTIAL_AT: [TO_EXP_NEG, TO_EXP_POS],
	        RANGE: [MIN_EXP, MAX_EXP],
	        CRYPTO: CRYPTO,
	        MODULO_MODE: MODULO_MODE,
	        POW_PRECISION: POW_PRECISION,
	        FORMAT: FORMAT,
	        ALPHABET: ALPHABET
	      };
	    };


	    /*
	     * Return true if v is a BigNumber instance, otherwise return false.
	     *
	     * If BigNumber.DEBUG is true, throw if a BigNumber instance is not well-formed.
	     *
	     * v {any}
	     *
	     * '[BigNumber Error] Invalid BigNumber: {v}'
	     */
	    BigNumber.isBigNumber = function (v) {
	      if (!v || v._isBigNumber !== true) return false;
	      if (!BigNumber.DEBUG) return true;

	      var i, n,
	        c = v.c,
	        e = v.e,
	        s = v.s;

	      out: if ({}.toString.call(c) == '[object Array]') {

	        if ((s === 1 || s === -1) && e >= -MAX && e <= MAX && e === mathfloor(e)) {

	          // If the first element is zero, the BigNumber value must be zero.
	          if (c[0] === 0) {
	            if (e === 0 && c.length === 1) return true;
	            break out;
	          }

	          // Calculate number of digits that c[0] should have, based on the exponent.
	          i = (e + 1) % LOG_BASE;
	          if (i < 1) i += LOG_BASE;

	          // Calculate number of digits of c[0].
	          //if (Math.ceil(Math.log(c[0] + 1) / Math.LN10) == i) {
	          if (String(c[0]).length == i) {

	            for (i = 0; i < c.length; i++) {
	              n = c[i];
	              if (n < 0 || n >= BASE || n !== mathfloor(n)) break out;
	            }

	            // Last element cannot be zero, unless it is the only element.
	            if (n !== 0) return true;
	          }
	        }

	      // Infinity/NaN
	      } else if (c === null && e === null && (s === null || s === 1 || s === -1)) {
	        return true;
	      }

	      throw Error
	        (bignumberError + 'Invalid BigNumber: ' + v);
	    };


	    /*
	     * Return a new BigNumber whose value is the maximum of the arguments.
	     *
	     * arguments {number|string|BigNumber}
	     */
	    BigNumber.maximum = BigNumber.max = function () {
	      return maxOrMin(arguments, P.lt);
	    };


	    /*
	     * Return a new BigNumber whose value is the minimum of the arguments.
	     *
	     * arguments {number|string|BigNumber}
	     */
	    BigNumber.minimum = BigNumber.min = function () {
	      return maxOrMin(arguments, P.gt);
	    };


	    /*
	     * Return a new BigNumber with a random value equal to or greater than 0 and less than 1,
	     * and with dp, or DECIMAL_PLACES if dp is omitted, decimal places (or less if trailing
	     * zeros are produced).
	     *
	     * [dp] {number} Decimal places. Integer, 0 to MAX inclusive.
	     *
	     * '[BigNumber Error] Argument {not a primitive number|not an integer|out of range}: {dp}'
	     * '[BigNumber Error] crypto unavailable'
	     */
	    BigNumber.random = (function () {
	      var pow2_53 = 0x20000000000000;

	      // Return a 53 bit integer n, where 0 <= n < 9007199254740992.
	      // Check if Math.random() produces more than 32 bits of randomness.
	      // If it does, assume at least 53 bits are produced, otherwise assume at least 30 bits.
	      // 0x40000000 is 2^30, 0x800000 is 2^23, 0x1fffff is 2^21 - 1.
	      var random53bitInt = (Math.random() * pow2_53) & 0x1fffff
	       ? function () { return mathfloor(Math.random() * pow2_53); }
	       : function () { return ((Math.random() * 0x40000000 | 0) * 0x800000) +
	         (Math.random() * 0x800000 | 0); };

	      return function (dp) {
	        var a, b, e, k, v,
	          i = 0,
	          c = [],
	          rand = new BigNumber(ONE);

	        if (dp == null) dp = DECIMAL_PLACES;
	        else intCheck(dp, 0, MAX);

	        k = mathceil(dp / LOG_BASE);

	        if (CRYPTO) {

	          // Browsers supporting crypto.getRandomValues.
	          if (crypto.getRandomValues) {

	            a = crypto.getRandomValues(new Uint32Array(k *= 2));

	            for (; i < k;) {

	              // 53 bits:
	              // ((Math.pow(2, 32) - 1) * Math.pow(2, 21)).toString(2)
	              // 11111 11111111 11111111 11111111 11100000 00000000 00000000
	              // ((Math.pow(2, 32) - 1) >>> 11).toString(2)
	              //                                     11111 11111111 11111111
	              // 0x20000 is 2^21.
	              v = a[i] * 0x20000 + (a[i + 1] >>> 11);

	              // Rejection sampling:
	              // 0 <= v < 9007199254740992
	              // Probability that v >= 9e15, is
	              // 7199254740992 / 9007199254740992 ~= 0.0008, i.e. 1 in 1251
	              if (v >= 9e15) {
	                b = crypto.getRandomValues(new Uint32Array(2));
	                a[i] = b[0];
	                a[i + 1] = b[1];
	              } else {

	                // 0 <= v <= 8999999999999999
	                // 0 <= (v % 1e14) <= 99999999999999
	                c.push(v % 1e14);
	                i += 2;
	              }
	            }
	            i = k / 2;

	          // Node.js supporting crypto.randomBytes.
	          } else if (crypto.randomBytes) {

	            // buffer
	            a = crypto.randomBytes(k *= 7);

	            for (; i < k;) {

	              // 0x1000000000000 is 2^48, 0x10000000000 is 2^40
	              // 0x100000000 is 2^32, 0x1000000 is 2^24
	              // 11111 11111111 11111111 11111111 11111111 11111111 11111111
	              // 0 <= v < 9007199254740992
	              v = ((a[i] & 31) * 0x1000000000000) + (a[i + 1] * 0x10000000000) +
	                 (a[i + 2] * 0x100000000) + (a[i + 3] * 0x1000000) +
	                 (a[i + 4] << 16) + (a[i + 5] << 8) + a[i + 6];

	              if (v >= 9e15) {
	                crypto.randomBytes(7).copy(a, i);
	              } else {

	                // 0 <= (v % 1e14) <= 99999999999999
	                c.push(v % 1e14);
	                i += 7;
	              }
	            }
	            i = k / 7;
	          } else {
	            CRYPTO = false;
	            throw Error
	             (bignumberError + 'crypto unavailable');
	          }
	        }

	        // Use Math.random.
	        if (!CRYPTO) {

	          for (; i < k;) {
	            v = random53bitInt();
	            if (v < 9e15) c[i++] = v % 1e14;
	          }
	        }

	        k = c[--i];
	        dp %= LOG_BASE;

	        // Convert trailing digits to zeros according to dp.
	        if (k && dp) {
	          v = POWS_TEN[LOG_BASE - dp];
	          c[i] = mathfloor(k / v) * v;
	        }

	        // Remove trailing elements which are zero.
	        for (; c[i] === 0; c.pop(), i--);

	        // Zero?
	        if (i < 0) {
	          c = [e = 0];
	        } else {

	          // Remove leading elements which are zero and adjust exponent accordingly.
	          for (e = -1 ; c[0] === 0; c.splice(0, 1), e -= LOG_BASE);

	          // Count the digits of the first element of c to determine leading zeros, and...
	          for (i = 1, v = c[0]; v >= 10; v /= 10, i++);

	          // adjust the exponent accordingly.
	          if (i < LOG_BASE) e -= LOG_BASE - i;
	        }

	        rand.e = e;
	        rand.c = c;
	        return rand;
	      };
	    })();


	    /*
	     * Return a BigNumber whose value is the sum of the arguments.
	     *
	     * arguments {number|string|BigNumber}
	     */
	    BigNumber.sum = function () {
	      var i = 1,
	        args = arguments,
	        sum = new BigNumber(args[0]);
	      for (; i < args.length;) sum = sum.plus(args[i++]);
	      return sum;
	    };


	    // PRIVATE FUNCTIONS


	    // Called by BigNumber and BigNumber.prototype.toString.
	    convertBase = (function () {
	      var decimal = '0123456789';

	      /*
	       * Convert string of baseIn to an array of numbers of baseOut.
	       * Eg. toBaseOut('255', 10, 16) returns [15, 15].
	       * Eg. toBaseOut('ff', 16, 10) returns [2, 5, 5].
	       */
	      function toBaseOut(str, baseIn, baseOut, alphabet) {
	        var j,
	          arr = [0],
	          arrL,
	          i = 0,
	          len = str.length;

	        for (; i < len;) {
	          for (arrL = arr.length; arrL--; arr[arrL] *= baseIn);

	          arr[0] += alphabet.indexOf(str.charAt(i++));

	          for (j = 0; j < arr.length; j++) {

	            if (arr[j] > baseOut - 1) {
	              if (arr[j + 1] == null) arr[j + 1] = 0;
	              arr[j + 1] += arr[j] / baseOut | 0;
	              arr[j] %= baseOut;
	            }
	          }
	        }

	        return arr.reverse();
	      }

	      // Convert a numeric string of baseIn to a numeric string of baseOut.
	      // If the caller is toString, we are converting from base 10 to baseOut.
	      // If the caller is BigNumber, we are converting from baseIn to base 10.
	      return function (str, baseIn, baseOut, sign, callerIsToString) {
	        var alphabet, d, e, k, r, x, xc, y,
	          i = str.indexOf('.'),
	          dp = DECIMAL_PLACES,
	          rm = ROUNDING_MODE;

	        // Non-integer.
	        if (i >= 0) {
	          k = POW_PRECISION;

	          // Unlimited precision.
	          POW_PRECISION = 0;
	          str = str.replace('.', '');
	          y = new BigNumber(baseIn);
	          x = y.pow(str.length - i);
	          POW_PRECISION = k;

	          // Convert str as if an integer, then restore the fraction part by dividing the
	          // result by its base raised to a power.

	          y.c = toBaseOut(toFixedPoint(coeffToString(x.c), x.e, '0'),
	           10, baseOut, decimal);
	          y.e = y.c.length;
	        }

	        // Convert the number as integer.

	        xc = toBaseOut(str, baseIn, baseOut, callerIsToString
	         ? (alphabet = ALPHABET, decimal)
	         : (alphabet = decimal, ALPHABET));

	        // xc now represents str as an integer and converted to baseOut. e is the exponent.
	        e = k = xc.length;

	        // Remove trailing zeros.
	        for (; xc[--k] == 0; xc.pop());

	        // Zero?
	        if (!xc[0]) return alphabet.charAt(0);

	        // Does str represent an integer? If so, no need for the division.
	        if (i < 0) {
	          --e;
	        } else {
	          x.c = xc;
	          x.e = e;

	          // The sign is needed for correct rounding.
	          x.s = sign;
	          x = div(x, y, dp, rm, baseOut);
	          xc = x.c;
	          r = x.r;
	          e = x.e;
	        }

	        // xc now represents str converted to baseOut.

	        // THe index of the rounding digit.
	        d = e + dp + 1;

	        // The rounding digit: the digit to the right of the digit that may be rounded up.
	        i = xc[d];

	        // Look at the rounding digits and mode to determine whether to round up.

	        k = baseOut / 2;
	        r = r || d < 0 || xc[d + 1] != null;

	        r = rm < 4 ? (i != null || r) && (rm == 0 || rm == (x.s < 0 ? 3 : 2))
	              : i > k || i == k &&(rm == 4 || r || rm == 6 && xc[d - 1] & 1 ||
	               rm == (x.s < 0 ? 8 : 7));

	        // If the index of the rounding digit is not greater than zero, or xc represents
	        // zero, then the result of the base conversion is zero or, if rounding up, a value
	        // such as 0.00001.
	        if (d < 1 || !xc[0]) {

	          // 1^-dp or 0
	          str = r ? toFixedPoint(alphabet.charAt(1), -dp, alphabet.charAt(0)) : alphabet.charAt(0);
	        } else {

	          // Truncate xc to the required number of decimal places.
	          xc.length = d;

	          // Round up?
	          if (r) {

	            // Rounding up may mean the previous digit has to be rounded up and so on.
	            for (--baseOut; ++xc[--d] > baseOut;) {
	              xc[d] = 0;

	              if (!d) {
	                ++e;
	                xc = [1].concat(xc);
	              }
	            }
	          }

	          // Determine trailing zeros.
	          for (k = xc.length; !xc[--k];);

	          // E.g. [4, 11, 15] becomes 4bf.
	          for (i = 0, str = ''; i <= k; str += alphabet.charAt(xc[i++]));

	          // Add leading zeros, decimal point and trailing zeros as required.
	          str = toFixedPoint(str, e, alphabet.charAt(0));
	        }

	        // The caller will add the sign.
	        return str;
	      };
	    })();


	    // Perform division in the specified base. Called by div and convertBase.
	    div = (function () {

	      // Assume non-zero x and k.
	      function multiply(x, k, base) {
	        var m, temp, xlo, xhi,
	          carry = 0,
	          i = x.length,
	          klo = k % SQRT_BASE,
	          khi = k / SQRT_BASE | 0;

	        for (x = x.slice(); i--;) {
	          xlo = x[i] % SQRT_BASE;
	          xhi = x[i] / SQRT_BASE | 0;
	          m = khi * xlo + xhi * klo;
	          temp = klo * xlo + ((m % SQRT_BASE) * SQRT_BASE) + carry;
	          carry = (temp / base | 0) + (m / SQRT_BASE | 0) + khi * xhi;
	          x[i] = temp % base;
	        }

	        if (carry) x = [carry].concat(x);

	        return x;
	      }

	      function compare(a, b, aL, bL) {
	        var i, cmp;

	        if (aL != bL) {
	          cmp = aL > bL ? 1 : -1;
	        } else {

	          for (i = cmp = 0; i < aL; i++) {

	            if (a[i] != b[i]) {
	              cmp = a[i] > b[i] ? 1 : -1;
	              break;
	            }
	          }
	        }

	        return cmp;
	      }

	      function subtract(a, b, aL, base) {
	        var i = 0;

	        // Subtract b from a.
	        for (; aL--;) {
	          a[aL] -= i;
	          i = a[aL] < b[aL] ? 1 : 0;
	          a[aL] = i * base + a[aL] - b[aL];
	        }

	        // Remove leading zeros.
	        for (; !a[0] && a.length > 1; a.splice(0, 1));
	      }

	      // x: dividend, y: divisor.
	      return function (x, y, dp, rm, base) {
	        var cmp, e, i, more, n, prod, prodL, q, qc, rem, remL, rem0, xi, xL, yc0,
	          yL, yz,
	          s = x.s == y.s ? 1 : -1,
	          xc = x.c,
	          yc = y.c;

	        // Either NaN, Infinity or 0?
	        if (!xc || !xc[0] || !yc || !yc[0]) {

	          return new BigNumber(

	           // Return NaN if either NaN, or both Infinity or 0.
	           !x.s || !y.s || (xc ? yc && xc[0] == yc[0] : !yc) ? NaN :

	            // Return ±0 if x is ±0 or y is ±Infinity, or return ±Infinity as y is ±0.
	            xc && xc[0] == 0 || !yc ? s * 0 : s / 0
	         );
	        }

	        q = new BigNumber(s);
	        qc = q.c = [];
	        e = x.e - y.e;
	        s = dp + e + 1;

	        if (!base) {
	          base = BASE;
	          e = bitFloor(x.e / LOG_BASE) - bitFloor(y.e / LOG_BASE);
	          s = s / LOG_BASE | 0;
	        }

	        // Result exponent may be one less then the current value of e.
	        // The coefficients of the BigNumbers from convertBase may have trailing zeros.
	        for (i = 0; yc[i] == (xc[i] || 0); i++);

	        if (yc[i] > (xc[i] || 0)) e--;

	        if (s < 0) {
	          qc.push(1);
	          more = true;
	        } else {
	          xL = xc.length;
	          yL = yc.length;
	          i = 0;
	          s += 2;

	          // Normalise xc and yc so highest order digit of yc is >= base / 2.

	          n = mathfloor(base / (yc[0] + 1));

	          // Not necessary, but to handle odd bases where yc[0] == (base / 2) - 1.
	          // if (n > 1 || n++ == 1 && yc[0] < base / 2) {
	          if (n > 1) {
	            yc = multiply(yc, n, base);
	            xc = multiply(xc, n, base);
	            yL = yc.length;
	            xL = xc.length;
	          }

	          xi = yL;
	          rem = xc.slice(0, yL);
	          remL = rem.length;

	          // Add zeros to make remainder as long as divisor.
	          for (; remL < yL; rem[remL++] = 0);
	          yz = yc.slice();
	          yz = [0].concat(yz);
	          yc0 = yc[0];
	          if (yc[1] >= base / 2) yc0++;
	          // Not necessary, but to prevent trial digit n > base, when using base 3.
	          // else if (base == 3 && yc0 == 1) yc0 = 1 + 1e-15;

	          do {
	            n = 0;

	            // Compare divisor and remainder.
	            cmp = compare(yc, rem, yL, remL);

	            // If divisor < remainder.
	            if (cmp < 0) {

	              // Calculate trial digit, n.

	              rem0 = rem[0];
	              if (yL != remL) rem0 = rem0 * base + (rem[1] || 0);

	              // n is how many times the divisor goes into the current remainder.
	              n = mathfloor(rem0 / yc0);

	              //  Algorithm:
	              //  product = divisor multiplied by trial digit (n).
	              //  Compare product and remainder.
	              //  If product is greater than remainder:
	              //    Subtract divisor from product, decrement trial digit.
	              //  Subtract product from remainder.
	              //  If product was less than remainder at the last compare:
	              //    Compare new remainder and divisor.
	              //    If remainder is greater than divisor:
	              //      Subtract divisor from remainder, increment trial digit.

	              if (n > 1) {

	                // n may be > base only when base is 3.
	                if (n >= base) n = base - 1;

	                // product = divisor * trial digit.
	                prod = multiply(yc, n, base);
	                prodL = prod.length;
	                remL = rem.length;

	                // Compare product and remainder.
	                // If product > remainder then trial digit n too high.
	                // n is 1 too high about 5% of the time, and is not known to have
	                // ever been more than 1 too high.
	                while (compare(prod, rem, prodL, remL) == 1) {
	                  n--;

	                  // Subtract divisor from product.
	                  subtract(prod, yL < prodL ? yz : yc, prodL, base);
	                  prodL = prod.length;
	                  cmp = 1;
	                }
	              } else {

	                // n is 0 or 1, cmp is -1.
	                // If n is 0, there is no need to compare yc and rem again below,
	                // so change cmp to 1 to avoid it.
	                // If n is 1, leave cmp as -1, so yc and rem are compared again.
	                if (n == 0) {

	                  // divisor < remainder, so n must be at least 1.
	                  cmp = n = 1;
	                }

	                // product = divisor
	                prod = yc.slice();
	                prodL = prod.length;
	              }

	              if (prodL < remL) prod = [0].concat(prod);

	              // Subtract product from remainder.
	              subtract(rem, prod, remL, base);
	              remL = rem.length;

	               // If product was < remainder.
	              if (cmp == -1) {

	                // Compare divisor and new remainder.
	                // If divisor < new remainder, subtract divisor from remainder.
	                // Trial digit n too low.
	                // n is 1 too low about 5% of the time, and very rarely 2 too low.
	                while (compare(yc, rem, yL, remL) < 1) {
	                  n++;

	                  // Subtract divisor from remainder.
	                  subtract(rem, yL < remL ? yz : yc, remL, base);
	                  remL = rem.length;
	                }
	              }
	            } else if (cmp === 0) {
	              n++;
	              rem = [0];
	            } // else cmp === 1 and n will be 0

	            // Add the next digit, n, to the result array.
	            qc[i++] = n;

	            // Update the remainder.
	            if (rem[0]) {
	              rem[remL++] = xc[xi] || 0;
	            } else {
	              rem = [xc[xi]];
	              remL = 1;
	            }
	          } while ((xi++ < xL || rem[0] != null) && s--);

	          more = rem[0] != null;

	          // Leading zero?
	          if (!qc[0]) qc.splice(0, 1);
	        }

	        if (base == BASE) {

	          // To calculate q.e, first get the number of digits of qc[0].
	          for (i = 1, s = qc[0]; s >= 10; s /= 10, i++);

	          round(q, dp + (q.e = i + e * LOG_BASE - 1) + 1, rm, more);

	        // Caller is convertBase.
	        } else {
	          q.e = e;
	          q.r = +more;
	        }

	        return q;
	      };
	    })();


	    /*
	     * Return a string representing the value of BigNumber n in fixed-point or exponential
	     * notation rounded to the specified decimal places or significant digits.
	     *
	     * n: a BigNumber.
	     * i: the index of the last digit required (i.e. the digit that may be rounded up).
	     * rm: the rounding mode.
	     * id: 1 (toExponential) or 2 (toPrecision).
	     */
	    function format(n, i, rm, id) {
	      var c0, e, ne, len, str;

	      if (rm == null) rm = ROUNDING_MODE;
	      else intCheck(rm, 0, 8);

	      if (!n.c) return n.toString();

	      c0 = n.c[0];
	      ne = n.e;

	      if (i == null) {
	        str = coeffToString(n.c);
	        str = id == 1 || id == 2 && (ne <= TO_EXP_NEG || ne >= TO_EXP_POS)
	         ? toExponential(str, ne)
	         : toFixedPoint(str, ne, '0');
	      } else {
	        n = round(new BigNumber(n), i, rm);

	        // n.e may have changed if the value was rounded up.
	        e = n.e;

	        str = coeffToString(n.c);
	        len = str.length;

	        // toPrecision returns exponential notation if the number of significant digits
	        // specified is less than the number of digits necessary to represent the integer
	        // part of the value in fixed-point notation.

	        // Exponential notation.
	        if (id == 1 || id == 2 && (i <= e || e <= TO_EXP_NEG)) {

	          // Append zeros?
	          for (; len < i; str += '0', len++);
	          str = toExponential(str, e);

	        // Fixed-point notation.
	        } else {
	          i -= ne;
	          str = toFixedPoint(str, e, '0');

	          // Append zeros?
	          if (e + 1 > len) {
	            if (--i > 0) for (str += '.'; i--; str += '0');
	          } else {
	            i += e - len;
	            if (i > 0) {
	              if (e + 1 == len) str += '.';
	              for (; i--; str += '0');
	            }
	          }
	        }
	      }

	      return n.s < 0 && c0 ? '-' + str : str;
	    }


	    // Handle BigNumber.max and BigNumber.min.
	    function maxOrMin(args, method) {
	      var n,
	        i = 1,
	        m = new BigNumber(args[0]);

	      for (; i < args.length; i++) {
	        n = new BigNumber(args[i]);

	        // If any number is NaN, return NaN.
	        if (!n.s) {
	          m = n;
	          break;
	        } else if (method.call(m, n)) {
	          m = n;
	        }
	      }

	      return m;
	    }


	    /*
	     * Strip trailing zeros, calculate base 10 exponent and check against MIN_EXP and MAX_EXP.
	     * Called by minus, plus and times.
	     */
	    function normalise(n, c, e) {
	      var i = 1,
	        j = c.length;

	       // Remove trailing zeros.
	      for (; !c[--j]; c.pop());

	      // Calculate the base 10 exponent. First get the number of digits of c[0].
	      for (j = c[0]; j >= 10; j /= 10, i++);

	      // Overflow?
	      if ((e = i + e * LOG_BASE - 1) > MAX_EXP) {

	        // Infinity.
	        n.c = n.e = null;

	      // Underflow?
	      } else if (e < MIN_EXP) {

	        // Zero.
	        n.c = [n.e = 0];
	      } else {
	        n.e = e;
	        n.c = c;
	      }

	      return n;
	    }


	    // Handle values that fail the validity test in BigNumber.
	    parseNumeric = (function () {
	      var basePrefix = /^(-?)0([xbo])(?=\w[\w.]*$)/i,
	        dotAfter = /^([^.]+)\.$/,
	        dotBefore = /^\.([^.]+)$/,
	        isInfinityOrNaN = /^-?(Infinity|NaN)$/,
	        whitespaceOrPlus = /^\s*\+(?=[\w.])|^\s+|\s+$/g;

	      return function (x, str, isNum, b) {
	        var base,
	          s = isNum ? str : str.replace(whitespaceOrPlus, '');

	        // No exception on ±Infinity or NaN.
	        if (isInfinityOrNaN.test(s)) {
	          x.s = isNaN(s) ? null : s < 0 ? -1 : 1;
	        } else {
	          if (!isNum) {

	            // basePrefix = /^(-?)0([xbo])(?=\w[\w.]*$)/i
	            s = s.replace(basePrefix, function (m, p1, p2) {
	              base = (p2 = p2.toLowerCase()) == 'x' ? 16 : p2 == 'b' ? 2 : 8;
	              return !b || b == base ? p1 : m;
	            });

	            if (b) {
	              base = b;

	              // E.g. '1.' to '1', '.1' to '0.1'
	              s = s.replace(dotAfter, '$1').replace(dotBefore, '0.$1');
	            }

	            if (str != s) return new BigNumber(s, base);
	          }

	          // '[BigNumber Error] Not a number: {n}'
	          // '[BigNumber Error] Not a base {b} number: {n}'
	          if (BigNumber.DEBUG) {
	            throw Error
	              (bignumberError + 'Not a' + (b ? ' base ' + b : '') + ' number: ' + str);
	          }

	          // NaN
	          x.s = null;
	        }

	        x.c = x.e = null;
	      }
	    })();


	    /*
	     * Round x to sd significant digits using rounding mode rm. Check for over/under-flow.
	     * If r is truthy, it is known that there are more digits after the rounding digit.
	     */
	    function round(x, sd, rm, r) {
	      var d, i, j, k, n, ni, rd,
	        xc = x.c,
	        pows10 = POWS_TEN;

	      // if x is not Infinity or NaN...
	      if (xc) {

	        // rd is the rounding digit, i.e. the digit after the digit that may be rounded up.
	        // n is a base 1e14 number, the value of the element of array x.c containing rd.
	        // ni is the index of n within x.c.
	        // d is the number of digits of n.
	        // i is the index of rd within n including leading zeros.
	        // j is the actual index of rd within n (if < 0, rd is a leading zero).
	        out: {

	          // Get the number of digits of the first element of xc.
	          for (d = 1, k = xc[0]; k >= 10; k /= 10, d++);
	          i = sd - d;

	          // If the rounding digit is in the first element of xc...
	          if (i < 0) {
	            i += LOG_BASE;
	            j = sd;
	            n = xc[ni = 0];

	            // Get the rounding digit at index j of n.
	            rd = n / pows10[d - j - 1] % 10 | 0;
	          } else {
	            ni = mathceil((i + 1) / LOG_BASE);

	            if (ni >= xc.length) {

	              if (r) {

	                // Needed by sqrt.
	                for (; xc.length <= ni; xc.push(0));
	                n = rd = 0;
	                d = 1;
	                i %= LOG_BASE;
	                j = i - LOG_BASE + 1;
	              } else {
	                break out;
	              }
	            } else {
	              n = k = xc[ni];

	              // Get the number of digits of n.
	              for (d = 1; k >= 10; k /= 10, d++);

	              // Get the index of rd within n.
	              i %= LOG_BASE;

	              // Get the index of rd within n, adjusted for leading zeros.
	              // The number of leading zeros of n is given by LOG_BASE - d.
	              j = i - LOG_BASE + d;

	              // Get the rounding digit at index j of n.
	              rd = j < 0 ? 0 : n / pows10[d - j - 1] % 10 | 0;
	            }
	          }

	          r = r || sd < 0 ||

	          // Are there any non-zero digits after the rounding digit?
	          // The expression  n % pows10[d - j - 1]  returns all digits of n to the right
	          // of the digit at j, e.g. if n is 908714 and j is 2, the expression gives 714.
	           xc[ni + 1] != null || (j < 0 ? n : n % pows10[d - j - 1]);

	          r = rm < 4
	           ? (rd || r) && (rm == 0 || rm == (x.s < 0 ? 3 : 2))
	           : rd > 5 || rd == 5 && (rm == 4 || r || rm == 6 &&

	            // Check whether the digit to the left of the rounding digit is odd.
	            ((i > 0 ? j > 0 ? n / pows10[d - j] : 0 : xc[ni - 1]) % 10) & 1 ||
	             rm == (x.s < 0 ? 8 : 7));

	          if (sd < 1 || !xc[0]) {
	            xc.length = 0;

	            if (r) {

	              // Convert sd to decimal places.
	              sd -= x.e + 1;

	              // 1, 0.1, 0.01, 0.001, 0.0001 etc.
	              xc[0] = pows10[(LOG_BASE - sd % LOG_BASE) % LOG_BASE];
	              x.e = -sd || 0;
	            } else {

	              // Zero.
	              xc[0] = x.e = 0;
	            }

	            return x;
	          }

	          // Remove excess digits.
	          if (i == 0) {
	            xc.length = ni;
	            k = 1;
	            ni--;
	          } else {
	            xc.length = ni + 1;
	            k = pows10[LOG_BASE - i];

	            // E.g. 56700 becomes 56000 if 7 is the rounding digit.
	            // j > 0 means i > number of leading zeros of n.
	            xc[ni] = j > 0 ? mathfloor(n / pows10[d - j] % pows10[j]) * k : 0;
	          }

	          // Round up?
	          if (r) {

	            for (; ;) {

	              // If the digit to be rounded up is in the first element of xc...
	              if (ni == 0) {

	                // i will be the length of xc[0] before k is added.
	                for (i = 1, j = xc[0]; j >= 10; j /= 10, i++);
	                j = xc[0] += k;
	                for (k = 1; j >= 10; j /= 10, k++);

	                // if i != k the length has increased.
	                if (i != k) {
	                  x.e++;
	                  if (xc[0] == BASE) xc[0] = 1;
	                }

	                break;
	              } else {
	                xc[ni] += k;
	                if (xc[ni] != BASE) break;
	                xc[ni--] = 0;
	                k = 1;
	              }
	            }
	          }

	          // Remove trailing zeros.
	          for (i = xc.length; xc[--i] === 0; xc.pop());
	        }

	        // Overflow? Infinity.
	        if (x.e > MAX_EXP) {
	          x.c = x.e = null;

	        // Underflow? Zero.
	        } else if (x.e < MIN_EXP) {
	          x.c = [x.e = 0];
	        }
	      }

	      return x;
	    }


	    function valueOf(n) {
	      var str,
	        e = n.e;

	      if (e === null) return n.toString();

	      str = coeffToString(n.c);

	      str = e <= TO_EXP_NEG || e >= TO_EXP_POS
	        ? toExponential(str, e)
	        : toFixedPoint(str, e, '0');

	      return n.s < 0 ? '-' + str : str;
	    }


	    // PROTOTYPE/INSTANCE METHODS


	    /*
	     * Return a new BigNumber whose value is the absolute value of this BigNumber.
	     */
	    P.absoluteValue = P.abs = function () {
	      var x = new BigNumber(this);
	      if (x.s < 0) x.s = 1;
	      return x;
	    };


	    /*
	     * Return
	     *   1 if the value of this BigNumber is greater than the value of BigNumber(y, b),
	     *   -1 if the value of this BigNumber is less than the value of BigNumber(y, b),
	     *   0 if they have the same value,
	     *   or null if the value of either is NaN.
	     */
	    P.comparedTo = function (y, b) {
	      return compare(this, new BigNumber(y, b));
	    };


	    /*
	     * If dp is undefined or null or true or false, return the number of decimal places of the
	     * value of this BigNumber, or null if the value of this BigNumber is ±Infinity or NaN.
	     *
	     * Otherwise, if dp is a number, return a new BigNumber whose value is the value of this
	     * BigNumber rounded to a maximum of dp decimal places using rounding mode rm, or
	     * ROUNDING_MODE if rm is omitted.
	     *
	     * [dp] {number} Decimal places: integer, 0 to MAX inclusive.
	     * [rm] {number} Rounding mode. Integer, 0 to 8 inclusive.
	     *
	     * '[BigNumber Error] Argument {not a primitive number|not an integer|out of range}: {dp|rm}'
	     */
	    P.decimalPlaces = P.dp = function (dp, rm) {
	      var c, n, v,
	        x = this;

	      if (dp != null) {
	        intCheck(dp, 0, MAX);
	        if (rm == null) rm = ROUNDING_MODE;
	        else intCheck(rm, 0, 8);

	        return round(new BigNumber(x), dp + x.e + 1, rm);
	      }

	      if (!(c = x.c)) return null;
	      n = ((v = c.length - 1) - bitFloor(this.e / LOG_BASE)) * LOG_BASE;

	      // Subtract the number of trailing zeros of the last number.
	      if (v = c[v]) for (; v % 10 == 0; v /= 10, n--);
	      if (n < 0) n = 0;

	      return n;
	    };


	    /*
	     *  n / 0 = I
	     *  n / N = N
	     *  n / I = 0
	     *  0 / n = 0
	     *  0 / 0 = N
	     *  0 / N = N
	     *  0 / I = 0
	     *  N / n = N
	     *  N / 0 = N
	     *  N / N = N
	     *  N / I = N
	     *  I / n = I
	     *  I / 0 = I
	     *  I / N = N
	     *  I / I = N
	     *
	     * Return a new BigNumber whose value is the value of this BigNumber divided by the value of
	     * BigNumber(y, b), rounded according to DECIMAL_PLACES and ROUNDING_MODE.
	     */
	    P.dividedBy = P.div = function (y, b) {
	      return div(this, new BigNumber(y, b), DECIMAL_PLACES, ROUNDING_MODE);
	    };


	    /*
	     * Return a new BigNumber whose value is the integer part of dividing the value of this
	     * BigNumber by the value of BigNumber(y, b).
	     */
	    P.dividedToIntegerBy = P.idiv = function (y, b) {
	      return div(this, new BigNumber(y, b), 0, 1);
	    };


	    /*
	     * Return a BigNumber whose value is the value of this BigNumber exponentiated by n.
	     *
	     * If m is present, return the result modulo m.
	     * If n is negative round according to DECIMAL_PLACES and ROUNDING_MODE.
	     * If POW_PRECISION is non-zero and m is not present, round to POW_PRECISION using ROUNDING_MODE.
	     *
	     * The modular power operation works efficiently when x, n, and m are integers, otherwise it
	     * is equivalent to calculating x.exponentiatedBy(n).modulo(m) with a POW_PRECISION of 0.
	     *
	     * n {number|string|BigNumber} The exponent. An integer.
	     * [m] {number|string|BigNumber} The modulus.
	     *
	     * '[BigNumber Error] Exponent not an integer: {n}'
	     */
	    P.exponentiatedBy = P.pow = function (n, m) {
	      var half, isModExp, i, k, more, nIsBig, nIsNeg, nIsOdd, y,
	        x = this;

	      n = new BigNumber(n);

	      // Allow NaN and ±Infinity, but not other non-integers.
	      if (n.c && !n.isInteger()) {
	        throw Error
	          (bignumberError + 'Exponent not an integer: ' + valueOf(n));
	      }

	      if (m != null) m = new BigNumber(m);

	      // Exponent of MAX_SAFE_INTEGER is 15.
	      nIsBig = n.e > 14;

	      // If x is NaN, ±Infinity, ±0 or ±1, or n is ±Infinity, NaN or ±0.
	      if (!x.c || !x.c[0] || x.c[0] == 1 && !x.e && x.c.length == 1 || !n.c || !n.c[0]) {

	        // The sign of the result of pow when x is negative depends on the evenness of n.
	        // If +n overflows to ±Infinity, the evenness of n would be not be known.
	        y = new BigNumber(Math.pow(+valueOf(x), nIsBig ? 2 - isOdd(n) : +valueOf(n)));
	        return m ? y.mod(m) : y;
	      }

	      nIsNeg = n.s < 0;

	      if (m) {

	        // x % m returns NaN if abs(m) is zero, or m is NaN.
	        if (m.c ? !m.c[0] : !m.s) return new BigNumber(NaN);

	        isModExp = !nIsNeg && x.isInteger() && m.isInteger();

	        if (isModExp) x = x.mod(m);

	      // Overflow to ±Infinity: >=2**1e10 or >=1.0000024**1e15.
	      // Underflow to ±0: <=0.79**1e10 or <=0.9999975**1e15.
	      } else if (n.e > 9 && (x.e > 0 || x.e < -1 || (x.e == 0
	        // [1, 240000000]
	        ? x.c[0] > 1 || nIsBig && x.c[1] >= 24e7
	        // [80000000000000]  [99999750000000]
	        : x.c[0] < 8e13 || nIsBig && x.c[0] <= 9999975e7))) {

	        // If x is negative and n is odd, k = -0, else k = 0.
	        k = x.s < 0 && isOdd(n) ? -0 : 0;

	        // If x >= 1, k = ±Infinity.
	        if (x.e > -1) k = 1 / k;

	        // If n is negative return ±0, else return ±Infinity.
	        return new BigNumber(nIsNeg ? 1 / k : k);

	      } else if (POW_PRECISION) {

	        // Truncating each coefficient array to a length of k after each multiplication
	        // equates to truncating significant digits to POW_PRECISION + [28, 41],
	        // i.e. there will be a minimum of 28 guard digits retained.
	        k = mathceil(POW_PRECISION / LOG_BASE + 2);
	      }

	      if (nIsBig) {
	        half = new BigNumber(0.5);
	        if (nIsNeg) n.s = 1;
	        nIsOdd = isOdd(n);
	      } else {
	        i = Math.abs(+valueOf(n));
	        nIsOdd = i % 2;
	      }

	      y = new BigNumber(ONE);

	      // Performs 54 loop iterations for n of 9007199254740991.
	      for (; ;) {

	        if (nIsOdd) {
	          y = y.times(x);
	          if (!y.c) break;

	          if (k) {
	            if (y.c.length > k) y.c.length = k;
	          } else if (isModExp) {
	            y = y.mod(m);    //y = y.minus(div(y, m, 0, MODULO_MODE).times(m));
	          }
	        }

	        if (i) {
	          i = mathfloor(i / 2);
	          if (i === 0) break;
	          nIsOdd = i % 2;
	        } else {
	          n = n.times(half);
	          round(n, n.e + 1, 1);

	          if (n.e > 14) {
	            nIsOdd = isOdd(n);
	          } else {
	            i = +valueOf(n);
	            if (i === 0) break;
	            nIsOdd = i % 2;
	          }
	        }

	        x = x.times(x);

	        if (k) {
	          if (x.c && x.c.length > k) x.c.length = k;
	        } else if (isModExp) {
	          x = x.mod(m);    //x = x.minus(div(x, m, 0, MODULO_MODE).times(m));
	        }
	      }

	      if (isModExp) return y;
	      if (nIsNeg) y = ONE.div(y);

	      return m ? y.mod(m) : k ? round(y, POW_PRECISION, ROUNDING_MODE, more) : y;
	    };


	    /*
	     * Return a new BigNumber whose value is the value of this BigNumber rounded to an integer
	     * using rounding mode rm, or ROUNDING_MODE if rm is omitted.
	     *
	     * [rm] {number} Rounding mode. Integer, 0 to 8 inclusive.
	     *
	     * '[BigNumber Error] Argument {not a primitive number|not an integer|out of range}: {rm}'
	     */
	    P.integerValue = function (rm) {
	      var n = new BigNumber(this);
	      if (rm == null) rm = ROUNDING_MODE;
	      else intCheck(rm, 0, 8);
	      return round(n, n.e + 1, rm);
	    };


	    /*
	     * Return true if the value of this BigNumber is equal to the value of BigNumber(y, b),
	     * otherwise return false.
	     */
	    P.isEqualTo = P.eq = function (y, b) {
	      return compare(this, new BigNumber(y, b)) === 0;
	    };


	    /*
	     * Return true if the value of this BigNumber is a finite number, otherwise return false.
	     */
	    P.isFinite = function () {
	      return !!this.c;
	    };


	    /*
	     * Return true if the value of this BigNumber is greater than the value of BigNumber(y, b),
	     * otherwise return false.
	     */
	    P.isGreaterThan = P.gt = function (y, b) {
	      return compare(this, new BigNumber(y, b)) > 0;
	    };


	    /*
	     * Return true if the value of this BigNumber is greater than or equal to the value of
	     * BigNumber(y, b), otherwise return false.
	     */
	    P.isGreaterThanOrEqualTo = P.gte = function (y, b) {
	      return (b = compare(this, new BigNumber(y, b))) === 1 || b === 0;

	    };


	    /*
	     * Return true if the value of this BigNumber is an integer, otherwise return false.
	     */
	    P.isInteger = function () {
	      return !!this.c && bitFloor(this.e / LOG_BASE) > this.c.length - 2;
	    };


	    /*
	     * Return true if the value of this BigNumber is less than the value of BigNumber(y, b),
	     * otherwise return false.
	     */
	    P.isLessThan = P.lt = function (y, b) {
	      return compare(this, new BigNumber(y, b)) < 0;
	    };


	    /*
	     * Return true if the value of this BigNumber is less than or equal to the value of
	     * BigNumber(y, b), otherwise return false.
	     */
	    P.isLessThanOrEqualTo = P.lte = function (y, b) {
	      return (b = compare(this, new BigNumber(y, b))) === -1 || b === 0;
	    };


	    /*
	     * Return true if the value of this BigNumber is NaN, otherwise return false.
	     */
	    P.isNaN = function () {
	      return !this.s;
	    };


	    /*
	     * Return true if the value of this BigNumber is negative, otherwise return false.
	     */
	    P.isNegative = function () {
	      return this.s < 0;
	    };


	    /*
	     * Return true if the value of this BigNumber is positive, otherwise return false.
	     */
	    P.isPositive = function () {
	      return this.s > 0;
	    };


	    /*
	     * Return true if the value of this BigNumber is 0 or -0, otherwise return false.
	     */
	    P.isZero = function () {
	      return !!this.c && this.c[0] == 0;
	    };


	    /*
	     *  n - 0 = n
	     *  n - N = N
	     *  n - I = -I
	     *  0 - n = -n
	     *  0 - 0 = 0
	     *  0 - N = N
	     *  0 - I = -I
	     *  N - n = N
	     *  N - 0 = N
	     *  N - N = N
	     *  N - I = N
	     *  I - n = I
	     *  I - 0 = I
	     *  I - N = N
	     *  I - I = N
	     *
	     * Return a new BigNumber whose value is the value of this BigNumber minus the value of
	     * BigNumber(y, b).
	     */
	    P.minus = function (y, b) {
	      var i, j, t, xLTy,
	        x = this,
	        a = x.s;

	      y = new BigNumber(y, b);
	      b = y.s;

	      // Either NaN?
	      if (!a || !b) return new BigNumber(NaN);

	      // Signs differ?
	      if (a != b) {
	        y.s = -b;
	        return x.plus(y);
	      }

	      var xe = x.e / LOG_BASE,
	        ye = y.e / LOG_BASE,
	        xc = x.c,
	        yc = y.c;

	      if (!xe || !ye) {

	        // Either Infinity?
	        if (!xc || !yc) return xc ? (y.s = -b, y) : new BigNumber(yc ? x : NaN);

	        // Either zero?
	        if (!xc[0] || !yc[0]) {

	          // Return y if y is non-zero, x if x is non-zero, or zero if both are zero.
	          return yc[0] ? (y.s = -b, y) : new BigNumber(xc[0] ? x :

	           // IEEE 754 (2008) 6.3: n - n = -0 when rounding to -Infinity
	           ROUNDING_MODE == 3 ? -0 : 0);
	        }
	      }

	      xe = bitFloor(xe);
	      ye = bitFloor(ye);
	      xc = xc.slice();

	      // Determine which is the bigger number.
	      if (a = xe - ye) {

	        if (xLTy = a < 0) {
	          a = -a;
	          t = xc;
	        } else {
	          ye = xe;
	          t = yc;
	        }

	        t.reverse();

	        // Prepend zeros to equalise exponents.
	        for (b = a; b--; t.push(0));
	        t.reverse();
	      } else {

	        // Exponents equal. Check digit by digit.
	        j = (xLTy = (a = xc.length) < (b = yc.length)) ? a : b;

	        for (a = b = 0; b < j; b++) {

	          if (xc[b] != yc[b]) {
	            xLTy = xc[b] < yc[b];
	            break;
	          }
	        }
	      }

	      // x < y? Point xc to the array of the bigger number.
	      if (xLTy) t = xc, xc = yc, yc = t, y.s = -y.s;

	      b = (j = yc.length) - (i = xc.length);

	      // Append zeros to xc if shorter.
	      // No need to add zeros to yc if shorter as subtract only needs to start at yc.length.
	      if (b > 0) for (; b--; xc[i++] = 0);
	      b = BASE - 1;

	      // Subtract yc from xc.
	      for (; j > a;) {

	        if (xc[--j] < yc[j]) {
	          for (i = j; i && !xc[--i]; xc[i] = b);
	          --xc[i];
	          xc[j] += BASE;
	        }

	        xc[j] -= yc[j];
	      }

	      // Remove leading zeros and adjust exponent accordingly.
	      for (; xc[0] == 0; xc.splice(0, 1), --ye);

	      // Zero?
	      if (!xc[0]) {

	        // Following IEEE 754 (2008) 6.3,
	        // n - n = +0  but  n - n = -0  when rounding towards -Infinity.
	        y.s = ROUNDING_MODE == 3 ? -1 : 1;
	        y.c = [y.e = 0];
	        return y;
	      }

	      // No need to check for Infinity as +x - +y != Infinity && -x - -y != Infinity
	      // for finite x and y.
	      return normalise(y, xc, ye);
	    };


	    /*
	     *   n % 0 =  N
	     *   n % N =  N
	     *   n % I =  n
	     *   0 % n =  0
	     *  -0 % n = -0
	     *   0 % 0 =  N
	     *   0 % N =  N
	     *   0 % I =  0
	     *   N % n =  N
	     *   N % 0 =  N
	     *   N % N =  N
	     *   N % I =  N
	     *   I % n =  N
	     *   I % 0 =  N
	     *   I % N =  N
	     *   I % I =  N
	     *
	     * Return a new BigNumber whose value is the value of this BigNumber modulo the value of
	     * BigNumber(y, b). The result depends on the value of MODULO_MODE.
	     */
	    P.modulo = P.mod = function (y, b) {
	      var q, s,
	        x = this;

	      y = new BigNumber(y, b);

	      // Return NaN if x is Infinity or NaN, or y is NaN or zero.
	      if (!x.c || !y.s || y.c && !y.c[0]) {
	        return new BigNumber(NaN);

	      // Return x if y is Infinity or x is zero.
	      } else if (!y.c || x.c && !x.c[0]) {
	        return new BigNumber(x);
	      }

	      if (MODULO_MODE == 9) {

	        // Euclidian division: q = sign(y) * floor(x / abs(y))
	        // r = x - qy    where  0 <= r < abs(y)
	        s = y.s;
	        y.s = 1;
	        q = div(x, y, 0, 3);
	        y.s = s;
	        q.s *= s;
	      } else {
	        q = div(x, y, 0, MODULO_MODE);
	      }

	      y = x.minus(q.times(y));

	      // To match JavaScript %, ensure sign of zero is sign of dividend.
	      if (!y.c[0] && MODULO_MODE == 1) y.s = x.s;

	      return y;
	    };


	    /*
	     *  n * 0 = 0
	     *  n * N = N
	     *  n * I = I
	     *  0 * n = 0
	     *  0 * 0 = 0
	     *  0 * N = N
	     *  0 * I = N
	     *  N * n = N
	     *  N * 0 = N
	     *  N * N = N
	     *  N * I = N
	     *  I * n = I
	     *  I * 0 = N
	     *  I * N = N
	     *  I * I = I
	     *
	     * Return a new BigNumber whose value is the value of this BigNumber multiplied by the value
	     * of BigNumber(y, b).
	     */
	    P.multipliedBy = P.times = function (y, b) {
	      var c, e, i, j, k, m, xcL, xlo, xhi, ycL, ylo, yhi, zc,
	        base, sqrtBase,
	        x = this,
	        xc = x.c,
	        yc = (y = new BigNumber(y, b)).c;

	      // Either NaN, ±Infinity or ±0?
	      if (!xc || !yc || !xc[0] || !yc[0]) {

	        // Return NaN if either is NaN, or one is 0 and the other is Infinity.
	        if (!x.s || !y.s || xc && !xc[0] && !yc || yc && !yc[0] && !xc) {
	          y.c = y.e = y.s = null;
	        } else {
	          y.s *= x.s;

	          // Return ±Infinity if either is ±Infinity.
	          if (!xc || !yc) {
	            y.c = y.e = null;

	          // Return ±0 if either is ±0.
	          } else {
	            y.c = [0];
	            y.e = 0;
	          }
	        }

	        return y;
	      }

	      e = bitFloor(x.e / LOG_BASE) + bitFloor(y.e / LOG_BASE);
	      y.s *= x.s;
	      xcL = xc.length;
	      ycL = yc.length;

	      // Ensure xc points to longer array and xcL to its length.
	      if (xcL < ycL) zc = xc, xc = yc, yc = zc, i = xcL, xcL = ycL, ycL = i;

	      // Initialise the result array with zeros.
	      for (i = xcL + ycL, zc = []; i--; zc.push(0));

	      base = BASE;
	      sqrtBase = SQRT_BASE;

	      for (i = ycL; --i >= 0;) {
	        c = 0;
	        ylo = yc[i] % sqrtBase;
	        yhi = yc[i] / sqrtBase | 0;

	        for (k = xcL, j = i + k; j > i;) {
	          xlo = xc[--k] % sqrtBase;
	          xhi = xc[k] / sqrtBase | 0;
	          m = yhi * xlo + xhi * ylo;
	          xlo = ylo * xlo + ((m % sqrtBase) * sqrtBase) + zc[j] + c;
	          c = (xlo / base | 0) + (m / sqrtBase | 0) + yhi * xhi;
	          zc[j--] = xlo % base;
	        }

	        zc[j] = c;
	      }

	      if (c) {
	        ++e;
	      } else {
	        zc.splice(0, 1);
	      }

	      return normalise(y, zc, e);
	    };


	    /*
	     * Return a new BigNumber whose value is the value of this BigNumber negated,
	     * i.e. multiplied by -1.
	     */
	    P.negated = function () {
	      var x = new BigNumber(this);
	      x.s = -x.s || null;
	      return x;
	    };


	    /*
	     *  n + 0 = n
	     *  n + N = N
	     *  n + I = I
	     *  0 + n = n
	     *  0 + 0 = 0
	     *  0 + N = N
	     *  0 + I = I
	     *  N + n = N
	     *  N + 0 = N
	     *  N + N = N
	     *  N + I = N
	     *  I + n = I
	     *  I + 0 = I
	     *  I + N = N
	     *  I + I = I
	     *
	     * Return a new BigNumber whose value is the value of this BigNumber plus the value of
	     * BigNumber(y, b).
	     */
	    P.plus = function (y, b) {
	      var t,
	        x = this,
	        a = x.s;

	      y = new BigNumber(y, b);
	      b = y.s;

	      // Either NaN?
	      if (!a || !b) return new BigNumber(NaN);

	      // Signs differ?
	       if (a != b) {
	        y.s = -b;
	        return x.minus(y);
	      }

	      var xe = x.e / LOG_BASE,
	        ye = y.e / LOG_BASE,
	        xc = x.c,
	        yc = y.c;

	      if (!xe || !ye) {

	        // Return ±Infinity if either ±Infinity.
	        if (!xc || !yc) return new BigNumber(a / 0);

	        // Either zero?
	        // Return y if y is non-zero, x if x is non-zero, or zero if both are zero.
	        if (!xc[0] || !yc[0]) return yc[0] ? y : new BigNumber(xc[0] ? x : a * 0);
	      }

	      xe = bitFloor(xe);
	      ye = bitFloor(ye);
	      xc = xc.slice();

	      // Prepend zeros to equalise exponents. Faster to use reverse then do unshifts.
	      if (a = xe - ye) {
	        if (a > 0) {
	          ye = xe;
	          t = yc;
	        } else {
	          a = -a;
	          t = xc;
	        }

	        t.reverse();
	        for (; a--; t.push(0));
	        t.reverse();
	      }

	      a = xc.length;
	      b = yc.length;

	      // Point xc to the longer array, and b to the shorter length.
	      if (a - b < 0) t = yc, yc = xc, xc = t, b = a;

	      // Only start adding at yc.length - 1 as the further digits of xc can be ignored.
	      for (a = 0; b;) {
	        a = (xc[--b] = xc[b] + yc[b] + a) / BASE | 0;
	        xc[b] = BASE === xc[b] ? 0 : xc[b] % BASE;
	      }

	      if (a) {
	        xc = [a].concat(xc);
	        ++ye;
	      }

	      // No need to check for zero, as +x + +y != 0 && -x + -y != 0
	      // ye = MAX_EXP + 1 possible
	      return normalise(y, xc, ye);
	    };


	    /*
	     * If sd is undefined or null or true or false, return the number of significant digits of
	     * the value of this BigNumber, or null if the value of this BigNumber is ±Infinity or NaN.
	     * If sd is true include integer-part trailing zeros in the count.
	     *
	     * Otherwise, if sd is a number, return a new BigNumber whose value is the value of this
	     * BigNumber rounded to a maximum of sd significant digits using rounding mode rm, or
	     * ROUNDING_MODE if rm is omitted.
	     *
	     * sd {number|boolean} number: significant digits: integer, 1 to MAX inclusive.
	     *                     boolean: whether to count integer-part trailing zeros: true or false.
	     * [rm] {number} Rounding mode. Integer, 0 to 8 inclusive.
	     *
	     * '[BigNumber Error] Argument {not a primitive number|not an integer|out of range}: {sd|rm}'
	     */
	    P.precision = P.sd = function (sd, rm) {
	      var c, n, v,
	        x = this;

	      if (sd != null && sd !== !!sd) {
	        intCheck(sd, 1, MAX);
	        if (rm == null) rm = ROUNDING_MODE;
	        else intCheck(rm, 0, 8);

	        return round(new BigNumber(x), sd, rm);
	      }

	      if (!(c = x.c)) return null;
	      v = c.length - 1;
	      n = v * LOG_BASE + 1;

	      if (v = c[v]) {

	        // Subtract the number of trailing zeros of the last element.
	        for (; v % 10 == 0; v /= 10, n--);

	        // Add the number of digits of the first element.
	        for (v = c[0]; v >= 10; v /= 10, n++);
	      }

	      if (sd && x.e + 1 > n) n = x.e + 1;

	      return n;
	    };


	    /*
	     * Return a new BigNumber whose value is the value of this BigNumber shifted by k places
	     * (powers of 10). Shift to the right if n > 0, and to the left if n < 0.
	     *
	     * k {number} Integer, -MAX_SAFE_INTEGER to MAX_SAFE_INTEGER inclusive.
	     *
	     * '[BigNumber Error] Argument {not a primitive number|not an integer|out of range}: {k}'
	     */
	    P.shiftedBy = function (k) {
	      intCheck(k, -MAX_SAFE_INTEGER, MAX_SAFE_INTEGER);
	      return this.times('1e' + k);
	    };


	    /*
	     *  sqrt(-n) =  N
	     *  sqrt(N) =  N
	     *  sqrt(-I) =  N
	     *  sqrt(I) =  I
	     *  sqrt(0) =  0
	     *  sqrt(-0) = -0
	     *
	     * Return a new BigNumber whose value is the square root of the value of this BigNumber,
	     * rounded according to DECIMAL_PLACES and ROUNDING_MODE.
	     */
	    P.squareRoot = P.sqrt = function () {
	      var m, n, r, rep, t,
	        x = this,
	        c = x.c,
	        s = x.s,
	        e = x.e,
	        dp = DECIMAL_PLACES + 4,
	        half = new BigNumber('0.5');

	      // Negative/NaN/Infinity/zero?
	      if (s !== 1 || !c || !c[0]) {
	        return new BigNumber(!s || s < 0 && (!c || c[0]) ? NaN : c ? x : 1 / 0);
	      }

	      // Initial estimate.
	      s = Math.sqrt(+valueOf(x));

	      // Math.sqrt underflow/overflow?
	      // Pass x to Math.sqrt as integer, then adjust the exponent of the result.
	      if (s == 0 || s == 1 / 0) {
	        n = coeffToString(c);
	        if ((n.length + e) % 2 == 0) n += '0';
	        s = Math.sqrt(+n);
	        e = bitFloor((e + 1) / 2) - (e < 0 || e % 2);

	        if (s == 1 / 0) {
	          n = '5e' + e;
	        } else {
	          n = s.toExponential();
	          n = n.slice(0, n.indexOf('e') + 1) + e;
	        }

	        r = new BigNumber(n);
	      } else {
	        r = new BigNumber(s + '');
	      }

	      // Check for zero.
	      // r could be zero if MIN_EXP is changed after the this value was created.
	      // This would cause a division by zero (x/t) and hence Infinity below, which would cause
	      // coeffToString to throw.
	      if (r.c[0]) {
	        e = r.e;
	        s = e + dp;
	        if (s < 3) s = 0;

	        // Newton-Raphson iteration.
	        for (; ;) {
	          t = r;
	          r = half.times(t.plus(div(x, t, dp, 1)));

	          if (coeffToString(t.c).slice(0, s) === (n = coeffToString(r.c)).slice(0, s)) {

	            // The exponent of r may here be one less than the final result exponent,
	            // e.g 0.0009999 (e-4) --> 0.001 (e-3), so adjust s so the rounding digits
	            // are indexed correctly.
	            if (r.e < e) --s;
	            n = n.slice(s - 3, s + 1);

	            // The 4th rounding digit may be in error by -1 so if the 4 rounding digits
	            // are 9999 or 4999 (i.e. approaching a rounding boundary) continue the
	            // iteration.
	            if (n == '9999' || !rep && n == '4999') {

	              // On the first iteration only, check to see if rounding up gives the
	              // exact result as the nines may infinitely repeat.
	              if (!rep) {
	                round(t, t.e + DECIMAL_PLACES + 2, 0);

	                if (t.times(t).eq(x)) {
	                  r = t;
	                  break;
	                }
	              }

	              dp += 4;
	              s += 4;
	              rep = 1;
	            } else {

	              // If rounding digits are null, 0{0,4} or 50{0,3}, check for exact
	              // result. If not, then there are further digits and m will be truthy.
	              if (!+n || !+n.slice(1) && n.charAt(0) == '5') {

	                // Truncate to the first rounding digit.
	                round(r, r.e + DECIMAL_PLACES + 2, 1);
	                m = !r.times(r).eq(x);
	              }

	              break;
	            }
	          }
	        }
	      }

	      return round(r, r.e + DECIMAL_PLACES + 1, ROUNDING_MODE, m);
	    };


	    /*
	     * Return a string representing the value of this BigNumber in exponential notation and
	     * rounded using ROUNDING_MODE to dp fixed decimal places.
	     *
	     * [dp] {number} Decimal places. Integer, 0 to MAX inclusive.
	     * [rm] {number} Rounding mode. Integer, 0 to 8 inclusive.
	     *
	     * '[BigNumber Error] Argument {not a primitive number|not an integer|out of range}: {dp|rm}'
	     */
	    P.toExponential = function (dp, rm) {
	      if (dp != null) {
	        intCheck(dp, 0, MAX);
	        dp++;
	      }
	      return format(this, dp, rm, 1);
	    };


	    /*
	     * Return a string representing the value of this BigNumber in fixed-point notation rounding
	     * to dp fixed decimal places using rounding mode rm, or ROUNDING_MODE if rm is omitted.
	     *
	     * Note: as with JavaScript's number type, (-0).toFixed(0) is '0',
	     * but e.g. (-0.00001).toFixed(0) is '-0'.
	     *
	     * [dp] {number} Decimal places. Integer, 0 to MAX inclusive.
	     * [rm] {number} Rounding mode. Integer, 0 to 8 inclusive.
	     *
	     * '[BigNumber Error] Argument {not a primitive number|not an integer|out of range}: {dp|rm}'
	     */
	    P.toFixed = function (dp, rm) {
	      if (dp != null) {
	        intCheck(dp, 0, MAX);
	        dp = dp + this.e + 1;
	      }
	      return format(this, dp, rm);
	    };


	    /*
	     * Return a string representing the value of this BigNumber in fixed-point notation rounded
	     * using rm or ROUNDING_MODE to dp decimal places, and formatted according to the properties
	     * of the format or FORMAT object (see BigNumber.set).
	     *
	     * The formatting object may contain some or all of the properties shown below.
	     *
	     * FORMAT = {
	     *   prefix: '',
	     *   groupSize: 3,
	     *   secondaryGroupSize: 0,
	     *   groupSeparator: ',',
	     *   decimalSeparator: '.',
	     *   fractionGroupSize: 0,
	     *   fractionGroupSeparator: '\xA0',      // non-breaking space
	     *   suffix: ''
	     * };
	     *
	     * [dp] {number} Decimal places. Integer, 0 to MAX inclusive.
	     * [rm] {number} Rounding mode. Integer, 0 to 8 inclusive.
	     * [format] {object} Formatting options. See FORMAT pbject above.
	     *
	     * '[BigNumber Error] Argument {not a primitive number|not an integer|out of range}: {dp|rm}'
	     * '[BigNumber Error] Argument not an object: {format}'
	     */
	    P.toFormat = function (dp, rm, format) {
	      var str,
	        x = this;

	      if (format == null) {
	        if (dp != null && rm && typeof rm == 'object') {
	          format = rm;
	          rm = null;
	        } else if (dp && typeof dp == 'object') {
	          format = dp;
	          dp = rm = null;
	        } else {
	          format = FORMAT;
	        }
	      } else if (typeof format != 'object') {
	        throw Error
	          (bignumberError + 'Argument not an object: ' + format);
	      }

	      str = x.toFixed(dp, rm);

	      if (x.c) {
	        var i,
	          arr = str.split('.'),
	          g1 = +format.groupSize,
	          g2 = +format.secondaryGroupSize,
	          groupSeparator = format.groupSeparator || '',
	          intPart = arr[0],
	          fractionPart = arr[1],
	          isNeg = x.s < 0,
	          intDigits = isNeg ? intPart.slice(1) : intPart,
	          len = intDigits.length;

	        if (g2) i = g1, g1 = g2, g2 = i, len -= i;

	        if (g1 > 0 && len > 0) {
	          i = len % g1 || g1;
	          intPart = intDigits.substr(0, i);
	          for (; i < len; i += g1) intPart += groupSeparator + intDigits.substr(i, g1);
	          if (g2 > 0) intPart += groupSeparator + intDigits.slice(i);
	          if (isNeg) intPart = '-' + intPart;
	        }

	        str = fractionPart
	         ? intPart + (format.decimalSeparator || '') + ((g2 = +format.fractionGroupSize)
	          ? fractionPart.replace(new RegExp('\\d{' + g2 + '}\\B', 'g'),
	           '$&' + (format.fractionGroupSeparator || ''))
	          : fractionPart)
	         : intPart;
	      }

	      return (format.prefix || '') + str + (format.suffix || '');
	    };


	    /*
	     * Return an array of two BigNumbers representing the value of this BigNumber as a simple
	     * fraction with an integer numerator and an integer denominator.
	     * The denominator will be a positive non-zero value less than or equal to the specified
	     * maximum denominator. If a maximum denominator is not specified, the denominator will be
	     * the lowest value necessary to represent the number exactly.
	     *
	     * [md] {number|string|BigNumber} Integer >= 1, or Infinity. The maximum denominator.
	     *
	     * '[BigNumber Error] Argument {not an integer|out of range} : {md}'
	     */
	    P.toFraction = function (md) {
	      var d, d0, d1, d2, e, exp, n, n0, n1, q, r, s,
	        x = this,
	        xc = x.c;

	      if (md != null) {
	        n = new BigNumber(md);

	        // Throw if md is less than one or is not an integer, unless it is Infinity.
	        if (!n.isInteger() && (n.c || n.s !== 1) || n.lt(ONE)) {
	          throw Error
	            (bignumberError + 'Argument ' +
	              (n.isInteger() ? 'out of range: ' : 'not an integer: ') + valueOf(n));
	        }
	      }

	      if (!xc) return new BigNumber(x);

	      d = new BigNumber(ONE);
	      n1 = d0 = new BigNumber(ONE);
	      d1 = n0 = new BigNumber(ONE);
	      s = coeffToString(xc);

	      // Determine initial denominator.
	      // d is a power of 10 and the minimum max denominator that specifies the value exactly.
	      e = d.e = s.length - x.e - 1;
	      d.c[0] = POWS_TEN[(exp = e % LOG_BASE) < 0 ? LOG_BASE + exp : exp];
	      md = !md || n.comparedTo(d) > 0 ? (e > 0 ? d : n1) : n;

	      exp = MAX_EXP;
	      MAX_EXP = 1 / 0;
	      n = new BigNumber(s);

	      // n0 = d1 = 0
	      n0.c[0] = 0;

	      for (; ;)  {
	        q = div(n, d, 0, 1);
	        d2 = d0.plus(q.times(d1));
	        if (d2.comparedTo(md) == 1) break;
	        d0 = d1;
	        d1 = d2;
	        n1 = n0.plus(q.times(d2 = n1));
	        n0 = d2;
	        d = n.minus(q.times(d2 = d));
	        n = d2;
	      }

	      d2 = div(md.minus(d0), d1, 0, 1);
	      n0 = n0.plus(d2.times(n1));
	      d0 = d0.plus(d2.times(d1));
	      n0.s = n1.s = x.s;
	      e = e * 2;

	      // Determine which fraction is closer to x, n0/d0 or n1/d1
	      r = div(n1, d1, e, ROUNDING_MODE).minus(x).abs().comparedTo(
	          div(n0, d0, e, ROUNDING_MODE).minus(x).abs()) < 1 ? [n1, d1] : [n0, d0];

	      MAX_EXP = exp;

	      return r;
	    };


	    /*
	     * Return the value of this BigNumber converted to a number primitive.
	     */
	    P.toNumber = function () {
	      return +valueOf(this);
	    };


	    /*
	     * Return a string representing the value of this BigNumber rounded to sd significant digits
	     * using rounding mode rm or ROUNDING_MODE. If sd is less than the number of digits
	     * necessary to represent the integer part of the value in fixed-point notation, then use
	     * exponential notation.
	     *
	     * [sd] {number} Significant digits. Integer, 1 to MAX inclusive.
	     * [rm] {number} Rounding mode. Integer, 0 to 8 inclusive.
	     *
	     * '[BigNumber Error] Argument {not a primitive number|not an integer|out of range}: {sd|rm}'
	     */
	    P.toPrecision = function (sd, rm) {
	      if (sd != null) intCheck(sd, 1, MAX);
	      return format(this, sd, rm, 2);
	    };


	    /*
	     * Return a string representing the value of this BigNumber in base b, or base 10 if b is
	     * omitted. If a base is specified, including base 10, round according to DECIMAL_PLACES and
	     * ROUNDING_MODE. If a base is not specified, and this BigNumber has a positive exponent
	     * that is equal to or greater than TO_EXP_POS, or a negative exponent equal to or less than
	     * TO_EXP_NEG, return exponential notation.
	     *
	     * [b] {number} Integer, 2 to ALPHABET.length inclusive.
	     *
	     * '[BigNumber Error] Base {not a primitive number|not an integer|out of range}: {b}'
	     */
	    P.toString = function (b) {
	      var str,
	        n = this,
	        s = n.s,
	        e = n.e;

	      // Infinity or NaN?
	      if (e === null) {
	        if (s) {
	          str = 'Infinity';
	          if (s < 0) str = '-' + str;
	        } else {
	          str = 'NaN';
	        }
	      } else {
	        if (b == null) {
	          str = e <= TO_EXP_NEG || e >= TO_EXP_POS
	           ? toExponential(coeffToString(n.c), e)
	           : toFixedPoint(coeffToString(n.c), e, '0');
	        } else if (b === 10 && alphabetHasNormalDecimalDigits) {
	          n = round(new BigNumber(n), DECIMAL_PLACES + e + 1, ROUNDING_MODE);
	          str = toFixedPoint(coeffToString(n.c), n.e, '0');
	        } else {
	          intCheck(b, 2, ALPHABET.length, 'Base');
	          str = convertBase(toFixedPoint(coeffToString(n.c), e, '0'), 10, b, s, true);
	        }

	        if (s < 0 && n.c[0]) str = '-' + str;
	      }

	      return str;
	    };


	    /*
	     * Return as toString, but do not accept a base argument, and include the minus sign for
	     * negative zero.
	     */
	    P.valueOf = P.toJSON = function () {
	      return valueOf(this);
	    };


	    P._isBigNumber = true;

	    if (configObject != null) BigNumber.set(configObject);

	    return BigNumber;
	  }


	  // PRIVATE HELPER FUNCTIONS

	  // These functions don't need access to variables,
	  // e.g. DECIMAL_PLACES, in the scope of the `clone` function above.


	  function bitFloor(n) {
	    var i = n | 0;
	    return n > 0 || n === i ? i : i - 1;
	  }


	  // Return a coefficient array as a string of base 10 digits.
	  function coeffToString(a) {
	    var s, z,
	      i = 1,
	      j = a.length,
	      r = a[0] + '';

	    for (; i < j;) {
	      s = a[i++] + '';
	      z = LOG_BASE - s.length;
	      for (; z--; s = '0' + s);
	      r += s;
	    }

	    // Determine trailing zeros.
	    for (j = r.length; r.charCodeAt(--j) === 48;);

	    return r.slice(0, j + 1 || 1);
	  }


	  // Compare the value of BigNumbers x and y.
	  function compare(x, y) {
	    var a, b,
	      xc = x.c,
	      yc = y.c,
	      i = x.s,
	      j = y.s,
	      k = x.e,
	      l = y.e;

	    // Either NaN?
	    if (!i || !j) return null;

	    a = xc && !xc[0];
	    b = yc && !yc[0];

	    // Either zero?
	    if (a || b) return a ? b ? 0 : -j : i;

	    // Signs differ?
	    if (i != j) return i;

	    a = i < 0;
	    b = k == l;

	    // Either Infinity?
	    if (!xc || !yc) return b ? 0 : !xc ^ a ? 1 : -1;

	    // Compare exponents.
	    if (!b) return k > l ^ a ? 1 : -1;

	    j = (k = xc.length) < (l = yc.length) ? k : l;

	    // Compare digit by digit.
	    for (i = 0; i < j; i++) if (xc[i] != yc[i]) return xc[i] > yc[i] ^ a ? 1 : -1;

	    // Compare lengths.
	    return k == l ? 0 : k > l ^ a ? 1 : -1;
	  }


	  /*
	   * Check that n is a primitive number, an integer, and in range, otherwise throw.
	   */
	  function intCheck(n, min, max, name) {
	    if (n < min || n > max || n !== mathfloor(n)) {
	      throw Error
	       (bignumberError + (name || 'Argument') + (typeof n == 'number'
	         ? n < min || n > max ? ' out of range: ' : ' not an integer: '
	         : ' not a primitive number: ') + String(n));
	    }
	  }


	  // Assumes finite n.
	  function isOdd(n) {
	    var k = n.c.length - 1;
	    return bitFloor(n.e / LOG_BASE) == k && n.c[k] % 2 != 0;
	  }


	  function toExponential(str, e) {
	    return (str.length > 1 ? str.charAt(0) + '.' + str.slice(1) : str) +
	     (e < 0 ? 'e' : 'e+') + e;
	  }


	  function toFixedPoint(str, e, z) {
	    var len, zs;

	    // Negative exponent?
	    if (e < 0) {

	      // Prepend zeros.
	      for (zs = z + '.'; ++e; zs += z);
	      str = zs + str;

	    // Positive exponent
	    } else {
	      len = str.length;

	      // Append zeros.
	      if (++e > len) {
	        for (zs = z, e -= len; --e; zs += z);
	        str += zs;
	      } else if (e < len) {
	        str = str.slice(0, e) + '.' + str.slice(e);
	      }
	    }

	    return str;
	  }


	  // EXPORT


	  BigNumber = clone();
	  BigNumber['default'] = BigNumber.BigNumber = BigNumber;

	  // AMD.
	  if (module.exports) {
	    module.exports = BigNumber;

	  // Browser.
	  } else {
	    if (!globalObject) {
	      globalObject = typeof self != 'undefined' && self ? self : window;
	    }

	    globalObject.BigNumber = BigNumber;
	  }
	})(commonjsGlobal);
} (bignumber));

Object.defineProperty(ar, "__esModule", { value: true });
const bignumber_js_1 = bignumber.exports;
class Ar {
    constructor() {
        // Configure and assign the constructor function for the bignumber library.
        this.BigNum = (value, decimals) => {
            let instance = bignumber_js_1.BigNumber.clone({ DECIMAL_PLACES: decimals });
            return new instance(value);
        };
    }
    winstonToAr(winstonString, { formatted = false, decimals = 12, trim = true } = {}) {
        let number = this.stringToBigNum(winstonString, decimals).shiftedBy(-12);
        return formatted ? number.toFormat(decimals) : number.toFixed(decimals);
    }
    arToWinston(arString, { formatted = false } = {}) {
        let number = this.stringToBigNum(arString).shiftedBy(12);
        return formatted ? number.toFormat() : number.toFixed(0);
    }
    compare(winstonStringA, winstonStringB) {
        let a = this.stringToBigNum(winstonStringA);
        let b = this.stringToBigNum(winstonStringB);
        return a.comparedTo(b);
    }
    isEqual(winstonStringA, winstonStringB) {
        return this.compare(winstonStringA, winstonStringB) === 0;
    }
    isLessThan(winstonStringA, winstonStringB) {
        let a = this.stringToBigNum(winstonStringA);
        let b = this.stringToBigNum(winstonStringB);
        return a.isLessThan(b);
    }
    isGreaterThan(winstonStringA, winstonStringB) {
        let a = this.stringToBigNum(winstonStringA);
        let b = this.stringToBigNum(winstonStringB);
        return a.isGreaterThan(b);
    }
    add(winstonStringA, winstonStringB) {
        let a = this.stringToBigNum(winstonStringA);
        this.stringToBigNum(winstonStringB);
        return a.plus(winstonStringB).toFixed(0);
    }
    sub(winstonStringA, winstonStringB) {
        let a = this.stringToBigNum(winstonStringA);
        this.stringToBigNum(winstonStringB);
        return a.minus(winstonStringB).toFixed(0);
    }
    stringToBigNum(stringValue, decimalPlaces = 12) {
        return this.BigNum(stringValue, decimalPlaces);
    }
}
ar.default = Ar;

var api = {};

var axios$2 = {exports: {}};

var axios$1 = {exports: {}};

var bind$2 = function bind(fn, thisArg) {
  return function wrap() {
    var args = new Array(arguments.length);
    for (var i = 0; i < args.length; i++) {
      args[i] = arguments[i];
    }
    return fn.apply(thisArg, args);
  };
};

var bind$1 = bind$2;

// utils is a library of generic helper functions non-specific to axios

var toString = Object.prototype.toString;

// eslint-disable-next-line func-names
var kindOf = (function(cache) {
  // eslint-disable-next-line func-names
  return function(thing) {
    var str = toString.call(thing);
    return cache[str] || (cache[str] = str.slice(8, -1).toLowerCase());
  };
})(Object.create(null));

function kindOfTest(type) {
  type = type.toLowerCase();
  return function isKindOf(thing) {
    return kindOf(thing) === type;
  };
}

/**
 * Determine if a value is an Array
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is an Array, otherwise false
 */
function isArray(val) {
  return Array.isArray(val);
}

/**
 * Determine if a value is undefined
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if the value is undefined, otherwise false
 */
function isUndefined(val) {
  return typeof val === 'undefined';
}

/**
 * Determine if a value is a Buffer
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a Buffer, otherwise false
 */
function isBuffer(val) {
  return val !== null && !isUndefined(val) && val.constructor !== null && !isUndefined(val.constructor)
    && typeof val.constructor.isBuffer === 'function' && val.constructor.isBuffer(val);
}

/**
 * Determine if a value is an ArrayBuffer
 *
 * @function
 * @param {Object} val The value to test
 * @returns {boolean} True if value is an ArrayBuffer, otherwise false
 */
var isArrayBuffer = kindOfTest('ArrayBuffer');


/**
 * Determine if a value is a view on an ArrayBuffer
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a view on an ArrayBuffer, otherwise false
 */
function isArrayBufferView(val) {
  var result;
  if ((typeof ArrayBuffer !== 'undefined') && (ArrayBuffer.isView)) {
    result = ArrayBuffer.isView(val);
  } else {
    result = (val) && (val.buffer) && (isArrayBuffer(val.buffer));
  }
  return result;
}

/**
 * Determine if a value is a String
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a String, otherwise false
 */
function isString(val) {
  return typeof val === 'string';
}

/**
 * Determine if a value is a Number
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a Number, otherwise false
 */
function isNumber(val) {
  return typeof val === 'number';
}

/**
 * Determine if a value is an Object
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is an Object, otherwise false
 */
function isObject(val) {
  return val !== null && typeof val === 'object';
}

/**
 * Determine if a value is a plain Object
 *
 * @param {Object} val The value to test
 * @return {boolean} True if value is a plain Object, otherwise false
 */
function isPlainObject(val) {
  if (kindOf(val) !== 'object') {
    return false;
  }

  var prototype = Object.getPrototypeOf(val);
  return prototype === null || prototype === Object.prototype;
}

/**
 * Determine if a value is a Date
 *
 * @function
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a Date, otherwise false
 */
var isDate = kindOfTest('Date');

/**
 * Determine if a value is a File
 *
 * @function
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a File, otherwise false
 */
var isFile = kindOfTest('File');

/**
 * Determine if a value is a Blob
 *
 * @function
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a Blob, otherwise false
 */
var isBlob = kindOfTest('Blob');

/**
 * Determine if a value is a FileList
 *
 * @function
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a File, otherwise false
 */
var isFileList = kindOfTest('FileList');

/**
 * Determine if a value is a Function
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a Function, otherwise false
 */
function isFunction(val) {
  return toString.call(val) === '[object Function]';
}

/**
 * Determine if a value is a Stream
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a Stream, otherwise false
 */
function isStream(val) {
  return isObject(val) && isFunction(val.pipe);
}

/**
 * Determine if a value is a FormData
 *
 * @param {Object} thing The value to test
 * @returns {boolean} True if value is an FormData, otherwise false
 */
function isFormData(thing) {
  var pattern = '[object FormData]';
  return thing && (
    (typeof FormData === 'function' && thing instanceof FormData) ||
    toString.call(thing) === pattern ||
    (isFunction(thing.toString) && thing.toString() === pattern)
  );
}

/**
 * Determine if a value is a URLSearchParams object
 * @function
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a URLSearchParams object, otherwise false
 */
var isURLSearchParams = kindOfTest('URLSearchParams');

/**
 * Trim excess whitespace off the beginning and end of a string
 *
 * @param {String} str The String to trim
 * @returns {String} The String freed of excess whitespace
 */
function trim(str) {
  return str.trim ? str.trim() : str.replace(/^\s+|\s+$/g, '');
}

/**
 * Determine if we're running in a standard browser environment
 *
 * This allows axios to run in a web worker, and react-native.
 * Both environments support XMLHttpRequest, but not fully standard globals.
 *
 * web workers:
 *  typeof window -> undefined
 *  typeof document -> undefined
 *
 * react-native:
 *  navigator.product -> 'ReactNative'
 * nativescript
 *  navigator.product -> 'NativeScript' or 'NS'
 */
function isStandardBrowserEnv() {
  if (typeof navigator !== 'undefined' && (navigator.product === 'ReactNative' ||
                                           navigator.product === 'NativeScript' ||
                                           navigator.product === 'NS')) {
    return false;
  }
  return (
    typeof window !== 'undefined' &&
    typeof document !== 'undefined'
  );
}

/**
 * Iterate over an Array or an Object invoking a function for each item.
 *
 * If `obj` is an Array callback will be called passing
 * the value, index, and complete array for each item.
 *
 * If 'obj' is an Object callback will be called passing
 * the value, key, and complete object for each property.
 *
 * @param {Object|Array} obj The object to iterate
 * @param {Function} fn The callback to invoke for each item
 */
function forEach(obj, fn) {
  // Don't bother if no value provided
  if (obj === null || typeof obj === 'undefined') {
    return;
  }

  // Force an array if not already something iterable
  if (typeof obj !== 'object') {
    /*eslint no-param-reassign:0*/
    obj = [obj];
  }

  if (isArray(obj)) {
    // Iterate over array values
    for (var i = 0, l = obj.length; i < l; i++) {
      fn.call(null, obj[i], i, obj);
    }
  } else {
    // Iterate over object keys
    for (var key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        fn.call(null, obj[key], key, obj);
      }
    }
  }
}

/**
 * Accepts varargs expecting each argument to be an object, then
 * immutably merges the properties of each object and returns result.
 *
 * When multiple objects contain the same key the later object in
 * the arguments list will take precedence.
 *
 * Example:
 *
 * ```js
 * var result = merge({foo: 123}, {foo: 456});
 * console.log(result.foo); // outputs 456
 * ```
 *
 * @param {Object} obj1 Object to merge
 * @returns {Object} Result of all merge properties
 */
function merge(/* obj1, obj2, obj3, ... */) {
  var result = {};
  function assignValue(val, key) {
    if (isPlainObject(result[key]) && isPlainObject(val)) {
      result[key] = merge(result[key], val);
    } else if (isPlainObject(val)) {
      result[key] = merge({}, val);
    } else if (isArray(val)) {
      result[key] = val.slice();
    } else {
      result[key] = val;
    }
  }

  for (var i = 0, l = arguments.length; i < l; i++) {
    forEach(arguments[i], assignValue);
  }
  return result;
}

/**
 * Extends object a by mutably adding to it the properties of object b.
 *
 * @param {Object} a The object to be extended
 * @param {Object} b The object to copy properties from
 * @param {Object} thisArg The object to bind function to
 * @return {Object} The resulting value of object a
 */
function extend(a, b, thisArg) {
  forEach(b, function assignValue(val, key) {
    if (thisArg && typeof val === 'function') {
      a[key] = bind$1(val, thisArg);
    } else {
      a[key] = val;
    }
  });
  return a;
}

/**
 * Remove byte order marker. This catches EF BB BF (the UTF-8 BOM)
 *
 * @param {string} content with BOM
 * @return {string} content value without BOM
 */
function stripBOM(content) {
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }
  return content;
}

/**
 * Inherit the prototype methods from one constructor into another
 * @param {function} constructor
 * @param {function} superConstructor
 * @param {object} [props]
 * @param {object} [descriptors]
 */

function inherits(constructor, superConstructor, props, descriptors) {
  constructor.prototype = Object.create(superConstructor.prototype, descriptors);
  constructor.prototype.constructor = constructor;
  props && Object.assign(constructor.prototype, props);
}

/**
 * Resolve object with deep prototype chain to a flat object
 * @param {Object} sourceObj source object
 * @param {Object} [destObj]
 * @param {Function} [filter]
 * @returns {Object}
 */

function toFlatObject(sourceObj, destObj, filter) {
  var props;
  var i;
  var prop;
  var merged = {};

  destObj = destObj || {};

  do {
    props = Object.getOwnPropertyNames(sourceObj);
    i = props.length;
    while (i-- > 0) {
      prop = props[i];
      if (!merged[prop]) {
        destObj[prop] = sourceObj[prop];
        merged[prop] = true;
      }
    }
    sourceObj = Object.getPrototypeOf(sourceObj);
  } while (sourceObj && (!filter || filter(sourceObj, destObj)) && sourceObj !== Object.prototype);

  return destObj;
}

/*
 * determines whether a string ends with the characters of a specified string
 * @param {String} str
 * @param {String} searchString
 * @param {Number} [position= 0]
 * @returns {boolean}
 */
function endsWith(str, searchString, position) {
  str = String(str);
  if (position === undefined || position > str.length) {
    position = str.length;
  }
  position -= searchString.length;
  var lastIndex = str.indexOf(searchString, position);
  return lastIndex !== -1 && lastIndex === position;
}


/**
 * Returns new array from array like object
 * @param {*} [thing]
 * @returns {Array}
 */
function toArray(thing) {
  if (!thing) return null;
  var i = thing.length;
  if (isUndefined(i)) return null;
  var arr = new Array(i);
  while (i-- > 0) {
    arr[i] = thing[i];
  }
  return arr;
}

// eslint-disable-next-line func-names
var isTypedArray = (function(TypedArray) {
  // eslint-disable-next-line func-names
  return function(thing) {
    return TypedArray && thing instanceof TypedArray;
  };
})(typeof Uint8Array !== 'undefined' && Object.getPrototypeOf(Uint8Array));

var utils$9 = {
  isArray: isArray,
  isArrayBuffer: isArrayBuffer,
  isBuffer: isBuffer,
  isFormData: isFormData,
  isArrayBufferView: isArrayBufferView,
  isString: isString,
  isNumber: isNumber,
  isObject: isObject,
  isPlainObject: isPlainObject,
  isUndefined: isUndefined,
  isDate: isDate,
  isFile: isFile,
  isBlob: isBlob,
  isFunction: isFunction,
  isStream: isStream,
  isURLSearchParams: isURLSearchParams,
  isStandardBrowserEnv: isStandardBrowserEnv,
  forEach: forEach,
  merge: merge,
  extend: extend,
  trim: trim,
  stripBOM: stripBOM,
  inherits: inherits,
  toFlatObject: toFlatObject,
  kindOf: kindOf,
  kindOfTest: kindOfTest,
  endsWith: endsWith,
  toArray: toArray,
  isTypedArray: isTypedArray,
  isFileList: isFileList
};

var utils$8 = utils$9;

function encode(val) {
  return encodeURIComponent(val).
    replace(/%3A/gi, ':').
    replace(/%24/g, '$').
    replace(/%2C/gi, ',').
    replace(/%20/g, '+').
    replace(/%5B/gi, '[').
    replace(/%5D/gi, ']');
}

/**
 * Build a URL by appending params to the end
 *
 * @param {string} url The base of the url (e.g., http://www.google.com)
 * @param {object} [params] The params to be appended
 * @returns {string} The formatted url
 */
var buildURL$1 = function buildURL(url, params, paramsSerializer) {
  /*eslint no-param-reassign:0*/
  if (!params) {
    return url;
  }

  var serializedParams;
  if (paramsSerializer) {
    serializedParams = paramsSerializer(params);
  } else if (utils$8.isURLSearchParams(params)) {
    serializedParams = params.toString();
  } else {
    var parts = [];

    utils$8.forEach(params, function serialize(val, key) {
      if (val === null || typeof val === 'undefined') {
        return;
      }

      if (utils$8.isArray(val)) {
        key = key + '[]';
      } else {
        val = [val];
      }

      utils$8.forEach(val, function parseValue(v) {
        if (utils$8.isDate(v)) {
          v = v.toISOString();
        } else if (utils$8.isObject(v)) {
          v = JSON.stringify(v);
        }
        parts.push(encode(key) + '=' + encode(v));
      });
    });

    serializedParams = parts.join('&');
  }

  if (serializedParams) {
    var hashmarkIndex = url.indexOf('#');
    if (hashmarkIndex !== -1) {
      url = url.slice(0, hashmarkIndex);
    }

    url += (url.indexOf('?') === -1 ? '?' : '&') + serializedParams;
  }

  return url;
};

var utils$7 = utils$9;

function InterceptorManager$1() {
  this.handlers = [];
}

/**
 * Add a new interceptor to the stack
 *
 * @param {Function} fulfilled The function to handle `then` for a `Promise`
 * @param {Function} rejected The function to handle `reject` for a `Promise`
 *
 * @return {Number} An ID used to remove interceptor later
 */
InterceptorManager$1.prototype.use = function use(fulfilled, rejected, options) {
  this.handlers.push({
    fulfilled: fulfilled,
    rejected: rejected,
    synchronous: options ? options.synchronous : false,
    runWhen: options ? options.runWhen : null
  });
  return this.handlers.length - 1;
};

/**
 * Remove an interceptor from the stack
 *
 * @param {Number} id The ID that was returned by `use`
 */
InterceptorManager$1.prototype.eject = function eject(id) {
  if (this.handlers[id]) {
    this.handlers[id] = null;
  }
};

/**
 * Iterate over all the registered interceptors
 *
 * This method is particularly useful for skipping over any
 * interceptors that may have become `null` calling `eject`.
 *
 * @param {Function} fn The function to call for each interceptor
 */
InterceptorManager$1.prototype.forEach = function forEach(fn) {
  utils$7.forEach(this.handlers, function forEachHandler(h) {
    if (h !== null) {
      fn(h);
    }
  });
};

var InterceptorManager_1 = InterceptorManager$1;

var utils$6 = utils$9;

var normalizeHeaderName$1 = function normalizeHeaderName(headers, normalizedName) {
  utils$6.forEach(headers, function processHeader(value, name) {
    if (name !== normalizedName && name.toUpperCase() === normalizedName.toUpperCase()) {
      headers[normalizedName] = value;
      delete headers[name];
    }
  });
};

var AxiosError_1;
var hasRequiredAxiosError;

function requireAxiosError () {
	if (hasRequiredAxiosError) return AxiosError_1;
	hasRequiredAxiosError = 1;

	var utils = utils$9;

	/**
	 * Create an Error with the specified message, config, error code, request and response.
	 *
	 * @param {string} message The error message.
	 * @param {string} [code] The error code (for example, 'ECONNABORTED').
	 * @param {Object} [config] The config.
	 * @param {Object} [request] The request.
	 * @param {Object} [response] The response.
	 * @returns {Error} The created error.
	 */
	function AxiosError(message, code, config, request, response) {
	  Error.call(this);
	  this.message = message;
	  this.name = 'AxiosError';
	  code && (this.code = code);
	  config && (this.config = config);
	  request && (this.request = request);
	  response && (this.response = response);
	}

	utils.inherits(AxiosError, Error, {
	  toJSON: function toJSON() {
	    return {
	      // Standard
	      message: this.message,
	      name: this.name,
	      // Microsoft
	      description: this.description,
	      number: this.number,
	      // Mozilla
	      fileName: this.fileName,
	      lineNumber: this.lineNumber,
	      columnNumber: this.columnNumber,
	      stack: this.stack,
	      // Axios
	      config: this.config,
	      code: this.code,
	      status: this.response && this.response.status ? this.response.status : null
	    };
	  }
	});

	var prototype = AxiosError.prototype;
	var descriptors = {};

	[
	  'ERR_BAD_OPTION_VALUE',
	  'ERR_BAD_OPTION',
	  'ECONNABORTED',
	  'ETIMEDOUT',
	  'ERR_NETWORK',
	  'ERR_FR_TOO_MANY_REDIRECTS',
	  'ERR_DEPRECATED',
	  'ERR_BAD_RESPONSE',
	  'ERR_BAD_REQUEST',
	  'ERR_CANCELED'
	// eslint-disable-next-line func-names
	].forEach(function(code) {
	  descriptors[code] = {value: code};
	});

	Object.defineProperties(AxiosError, descriptors);
	Object.defineProperty(prototype, 'isAxiosError', {value: true});

	// eslint-disable-next-line func-names
	AxiosError.from = function(error, code, config, request, response, customProps) {
	  var axiosError = Object.create(prototype);

	  utils.toFlatObject(error, axiosError, function filter(obj) {
	    return obj !== Error.prototype;
	  });

	  AxiosError.call(axiosError, error.message, code, config, request, response);

	  axiosError.name = error.name;

	  customProps && Object.assign(axiosError, customProps);

	  return axiosError;
	};

	AxiosError_1 = AxiosError;
	return AxiosError_1;
}

var transitional = {
  silentJSONParsing: true,
  forcedJSONParsing: true,
  clarifyTimeoutError: false
};

var toFormData_1;
var hasRequiredToFormData;

function requireToFormData () {
	if (hasRequiredToFormData) return toFormData_1;
	hasRequiredToFormData = 1;

	var utils = utils$9;

	/**
	 * Convert a data object to FormData
	 * @param {Object} obj
	 * @param {?Object} [formData]
	 * @returns {Object}
	 **/

	function toFormData(obj, formData) {
	  // eslint-disable-next-line no-param-reassign
	  formData = formData || new FormData();

	  var stack = [];

	  function convertValue(value) {
	    if (value === null) return '';

	    if (utils.isDate(value)) {
	      return value.toISOString();
	    }

	    if (utils.isArrayBuffer(value) || utils.isTypedArray(value)) {
	      return typeof Blob === 'function' ? new Blob([value]) : Buffer.from(value);
	    }

	    return value;
	  }

	  function build(data, parentKey) {
	    if (utils.isPlainObject(data) || utils.isArray(data)) {
	      if (stack.indexOf(data) !== -1) {
	        throw Error('Circular reference detected in ' + parentKey);
	      }

	      stack.push(data);

	      utils.forEach(data, function each(value, key) {
	        if (utils.isUndefined(value)) return;
	        var fullKey = parentKey ? parentKey + '.' + key : key;
	        var arr;

	        if (value && !parentKey && typeof value === 'object') {
	          if (utils.endsWith(key, '{}')) {
	            // eslint-disable-next-line no-param-reassign
	            value = JSON.stringify(value);
	          } else if (utils.endsWith(key, '[]') && (arr = utils.toArray(value))) {
	            // eslint-disable-next-line func-names
	            arr.forEach(function(el) {
	              !utils.isUndefined(el) && formData.append(fullKey, convertValue(el));
	            });
	            return;
	          }
	        }

	        build(value, fullKey);
	      });

	      stack.pop();
	    } else {
	      formData.append(parentKey, convertValue(data));
	    }
	  }

	  build(obj);

	  return formData;
	}

	toFormData_1 = toFormData;
	return toFormData_1;
}

var settle;
var hasRequiredSettle;

function requireSettle () {
	if (hasRequiredSettle) return settle;
	hasRequiredSettle = 1;

	var AxiosError = requireAxiosError();

	/**
	 * Resolve or reject a Promise based on response status.
	 *
	 * @param {Function} resolve A function that resolves the promise.
	 * @param {Function} reject A function that rejects the promise.
	 * @param {object} response The response.
	 */
	settle = function settle(resolve, reject, response) {
	  var validateStatus = response.config.validateStatus;
	  if (!response.status || !validateStatus || validateStatus(response.status)) {
	    resolve(response);
	  } else {
	    reject(new AxiosError(
	      'Request failed with status code ' + response.status,
	      [AxiosError.ERR_BAD_REQUEST, AxiosError.ERR_BAD_RESPONSE][Math.floor(response.status / 100) - 4],
	      response.config,
	      response.request,
	      response
	    ));
	  }
	};
	return settle;
}

var cookies;
var hasRequiredCookies;

function requireCookies () {
	if (hasRequiredCookies) return cookies;
	hasRequiredCookies = 1;

	var utils = utils$9;

	cookies = (
	  utils.isStandardBrowserEnv() ?

	  // Standard browser envs support document.cookie
	    (function standardBrowserEnv() {
	      return {
	        write: function write(name, value, expires, path, domain, secure) {
	          var cookie = [];
	          cookie.push(name + '=' + encodeURIComponent(value));

	          if (utils.isNumber(expires)) {
	            cookie.push('expires=' + new Date(expires).toGMTString());
	          }

	          if (utils.isString(path)) {
	            cookie.push('path=' + path);
	          }

	          if (utils.isString(domain)) {
	            cookie.push('domain=' + domain);
	          }

	          if (secure === true) {
	            cookie.push('secure');
	          }

	          document.cookie = cookie.join('; ');
	        },

	        read: function read(name) {
	          var match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
	          return (match ? decodeURIComponent(match[3]) : null);
	        },

	        remove: function remove(name) {
	          this.write(name, '', Date.now() - 86400000);
	        }
	      };
	    })() :

	  // Non standard browser env (web workers, react-native) lack needed support.
	    (function nonStandardBrowserEnv() {
	      return {
	        write: function write() {},
	        read: function read() { return null; },
	        remove: function remove() {}
	      };
	    })()
	);
	return cookies;
}

/**
 * Determines whether the specified URL is absolute
 *
 * @param {string} url The URL to test
 * @returns {boolean} True if the specified URL is absolute, otherwise false
 */
var isAbsoluteURL$1 = function isAbsoluteURL(url) {
  // A URL is considered absolute if it begins with "<scheme>://" or "//" (protocol-relative URL).
  // RFC 3986 defines scheme name as a sequence of characters beginning with a letter and followed
  // by any combination of letters, digits, plus, period, or hyphen.
  return /^([a-z][a-z\d+\-.]*:)?\/\//i.test(url);
};

/**
 * Creates a new URL by combining the specified URLs
 *
 * @param {string} baseURL The base URL
 * @param {string} relativeURL The relative URL
 * @returns {string} The combined URL
 */
var combineURLs$1 = function combineURLs(baseURL, relativeURL) {
  return relativeURL
    ? baseURL.replace(/\/+$/, '') + '/' + relativeURL.replace(/^\/+/, '')
    : baseURL;
};

var isAbsoluteURL = isAbsoluteURL$1;
var combineURLs = combineURLs$1;

/**
 * Creates a new URL by combining the baseURL with the requestedURL,
 * only when the requestedURL is not already an absolute URL.
 * If the requestURL is absolute, this function returns the requestedURL untouched.
 *
 * @param {string} baseURL The base URL
 * @param {string} requestedURL Absolute or relative URL to combine
 * @returns {string} The combined full path
 */
var buildFullPath$1 = function buildFullPath(baseURL, requestedURL) {
  if (baseURL && !isAbsoluteURL(requestedURL)) {
    return combineURLs(baseURL, requestedURL);
  }
  return requestedURL;
};

var parseHeaders;
var hasRequiredParseHeaders;

function requireParseHeaders () {
	if (hasRequiredParseHeaders) return parseHeaders;
	hasRequiredParseHeaders = 1;

	var utils = utils$9;

	// Headers whose duplicates are ignored by node
	// c.f. https://nodejs.org/api/http.html#http_message_headers
	var ignoreDuplicateOf = [
	  'age', 'authorization', 'content-length', 'content-type', 'etag',
	  'expires', 'from', 'host', 'if-modified-since', 'if-unmodified-since',
	  'last-modified', 'location', 'max-forwards', 'proxy-authorization',
	  'referer', 'retry-after', 'user-agent'
	];

	/**
	 * Parse headers into an object
	 *
	 * ```
	 * Date: Wed, 27 Aug 2014 08:58:49 GMT
	 * Content-Type: application/json
	 * Connection: keep-alive
	 * Transfer-Encoding: chunked
	 * ```
	 *
	 * @param {String} headers Headers needing to be parsed
	 * @returns {Object} Headers parsed into an object
	 */
	parseHeaders = function parseHeaders(headers) {
	  var parsed = {};
	  var key;
	  var val;
	  var i;

	  if (!headers) { return parsed; }

	  utils.forEach(headers.split('\n'), function parser(line) {
	    i = line.indexOf(':');
	    key = utils.trim(line.substr(0, i)).toLowerCase();
	    val = utils.trim(line.substr(i + 1));

	    if (key) {
	      if (parsed[key] && ignoreDuplicateOf.indexOf(key) >= 0) {
	        return;
	      }
	      if (key === 'set-cookie') {
	        parsed[key] = (parsed[key] ? parsed[key] : []).concat([val]);
	      } else {
	        parsed[key] = parsed[key] ? parsed[key] + ', ' + val : val;
	      }
	    }
	  });

	  return parsed;
	};
	return parseHeaders;
}

var isURLSameOrigin;
var hasRequiredIsURLSameOrigin;

function requireIsURLSameOrigin () {
	if (hasRequiredIsURLSameOrigin) return isURLSameOrigin;
	hasRequiredIsURLSameOrigin = 1;

	var utils = utils$9;

	isURLSameOrigin = (
	  utils.isStandardBrowserEnv() ?

	  // Standard browser envs have full support of the APIs needed to test
	  // whether the request URL is of the same origin as current location.
	    (function standardBrowserEnv() {
	      var msie = /(msie|trident)/i.test(navigator.userAgent);
	      var urlParsingNode = document.createElement('a');
	      var originURL;

	      /**
	    * Parse a URL to discover it's components
	    *
	    * @param {String} url The URL to be parsed
	    * @returns {Object}
	    */
	      function resolveURL(url) {
	        var href = url;

	        if (msie) {
	        // IE needs attribute set twice to normalize properties
	          urlParsingNode.setAttribute('href', href);
	          href = urlParsingNode.href;
	        }

	        urlParsingNode.setAttribute('href', href);

	        // urlParsingNode provides the UrlUtils interface - http://url.spec.whatwg.org/#urlutils
	        return {
	          href: urlParsingNode.href,
	          protocol: urlParsingNode.protocol ? urlParsingNode.protocol.replace(/:$/, '') : '',
	          host: urlParsingNode.host,
	          search: urlParsingNode.search ? urlParsingNode.search.replace(/^\?/, '') : '',
	          hash: urlParsingNode.hash ? urlParsingNode.hash.replace(/^#/, '') : '',
	          hostname: urlParsingNode.hostname,
	          port: urlParsingNode.port,
	          pathname: (urlParsingNode.pathname.charAt(0) === '/') ?
	            urlParsingNode.pathname :
	            '/' + urlParsingNode.pathname
	        };
	      }

	      originURL = resolveURL(window.location.href);

	      /**
	    * Determine if a URL shares the same origin as the current location
	    *
	    * @param {String} requestURL The URL to test
	    * @returns {boolean} True if URL shares the same origin, otherwise false
	    */
	      return function isURLSameOrigin(requestURL) {
	        var parsed = (utils.isString(requestURL)) ? resolveURL(requestURL) : requestURL;
	        return (parsed.protocol === originURL.protocol &&
	            parsed.host === originURL.host);
	      };
	    })() :

	  // Non standard browser envs (web workers, react-native) lack needed support.
	    (function nonStandardBrowserEnv() {
	      return function isURLSameOrigin() {
	        return true;
	      };
	    })()
	);
	return isURLSameOrigin;
}

var CanceledError_1;
var hasRequiredCanceledError;

function requireCanceledError () {
	if (hasRequiredCanceledError) return CanceledError_1;
	hasRequiredCanceledError = 1;

	var AxiosError = requireAxiosError();
	var utils = utils$9;

	/**
	 * A `CanceledError` is an object that is thrown when an operation is canceled.
	 *
	 * @class
	 * @param {string=} message The message.
	 */
	function CanceledError(message) {
	  // eslint-disable-next-line no-eq-null,eqeqeq
	  AxiosError.call(this, message == null ? 'canceled' : message, AxiosError.ERR_CANCELED);
	  this.name = 'CanceledError';
	}

	utils.inherits(CanceledError, AxiosError, {
	  __CANCEL__: true
	});

	CanceledError_1 = CanceledError;
	return CanceledError_1;
}

var parseProtocol;
var hasRequiredParseProtocol;

function requireParseProtocol () {
	if (hasRequiredParseProtocol) return parseProtocol;
	hasRequiredParseProtocol = 1;

	parseProtocol = function parseProtocol(url) {
	  var match = /^([-+\w]{1,25})(:?\/\/|:)/.exec(url);
	  return match && match[1] || '';
	};
	return parseProtocol;
}

var xhr;
var hasRequiredXhr;

function requireXhr () {
	if (hasRequiredXhr) return xhr;
	hasRequiredXhr = 1;

	var utils = utils$9;
	var settle = requireSettle();
	var cookies = requireCookies();
	var buildURL = buildURL$1;
	var buildFullPath = buildFullPath$1;
	var parseHeaders = requireParseHeaders();
	var isURLSameOrigin = requireIsURLSameOrigin();
	var transitionalDefaults = transitional;
	var AxiosError = requireAxiosError();
	var CanceledError = requireCanceledError();
	var parseProtocol = requireParseProtocol();

	xhr = function xhrAdapter(config) {
	  return new Promise(function dispatchXhrRequest(resolve, reject) {
	    var requestData = config.data;
	    var requestHeaders = config.headers;
	    var responseType = config.responseType;
	    var onCanceled;
	    function done() {
	      if (config.cancelToken) {
	        config.cancelToken.unsubscribe(onCanceled);
	      }

	      if (config.signal) {
	        config.signal.removeEventListener('abort', onCanceled);
	      }
	    }

	    if (utils.isFormData(requestData) && utils.isStandardBrowserEnv()) {
	      delete requestHeaders['Content-Type']; // Let the browser set it
	    }

	    var request = new XMLHttpRequest();

	    // HTTP basic authentication
	    if (config.auth) {
	      var username = config.auth.username || '';
	      var password = config.auth.password ? unescape(encodeURIComponent(config.auth.password)) : '';
	      requestHeaders.Authorization = 'Basic ' + btoa(username + ':' + password);
	    }

	    var fullPath = buildFullPath(config.baseURL, config.url);

	    request.open(config.method.toUpperCase(), buildURL(fullPath, config.params, config.paramsSerializer), true);

	    // Set the request timeout in MS
	    request.timeout = config.timeout;

	    function onloadend() {
	      if (!request) {
	        return;
	      }
	      // Prepare the response
	      var responseHeaders = 'getAllResponseHeaders' in request ? parseHeaders(request.getAllResponseHeaders()) : null;
	      var responseData = !responseType || responseType === 'text' ||  responseType === 'json' ?
	        request.responseText : request.response;
	      var response = {
	        data: responseData,
	        status: request.status,
	        statusText: request.statusText,
	        headers: responseHeaders,
	        config: config,
	        request: request
	      };

	      settle(function _resolve(value) {
	        resolve(value);
	        done();
	      }, function _reject(err) {
	        reject(err);
	        done();
	      }, response);

	      // Clean up request
	      request = null;
	    }

	    if ('onloadend' in request) {
	      // Use onloadend if available
	      request.onloadend = onloadend;
	    } else {
	      // Listen for ready state to emulate onloadend
	      request.onreadystatechange = function handleLoad() {
	        if (!request || request.readyState !== 4) {
	          return;
	        }

	        // The request errored out and we didn't get a response, this will be
	        // handled by onerror instead
	        // With one exception: request that using file: protocol, most browsers
	        // will return status as 0 even though it's a successful request
	        if (request.status === 0 && !(request.responseURL && request.responseURL.indexOf('file:') === 0)) {
	          return;
	        }
	        // readystate handler is calling before onerror or ontimeout handlers,
	        // so we should call onloadend on the next 'tick'
	        setTimeout(onloadend);
	      };
	    }

	    // Handle browser request cancellation (as opposed to a manual cancellation)
	    request.onabort = function handleAbort() {
	      if (!request) {
	        return;
	      }

	      reject(new AxiosError('Request aborted', AxiosError.ECONNABORTED, config, request));

	      // Clean up request
	      request = null;
	    };

	    // Handle low level network errors
	    request.onerror = function handleError() {
	      // Real errors are hidden from us by the browser
	      // onerror should only fire if it's a network error
	      reject(new AxiosError('Network Error', AxiosError.ERR_NETWORK, config, request, request));

	      // Clean up request
	      request = null;
	    };

	    // Handle timeout
	    request.ontimeout = function handleTimeout() {
	      var timeoutErrorMessage = config.timeout ? 'timeout of ' + config.timeout + 'ms exceeded' : 'timeout exceeded';
	      var transitional = config.transitional || transitionalDefaults;
	      if (config.timeoutErrorMessage) {
	        timeoutErrorMessage = config.timeoutErrorMessage;
	      }
	      reject(new AxiosError(
	        timeoutErrorMessage,
	        transitional.clarifyTimeoutError ? AxiosError.ETIMEDOUT : AxiosError.ECONNABORTED,
	        config,
	        request));

	      // Clean up request
	      request = null;
	    };

	    // Add xsrf header
	    // This is only done if running in a standard browser environment.
	    // Specifically not if we're in a web worker, or react-native.
	    if (utils.isStandardBrowserEnv()) {
	      // Add xsrf header
	      var xsrfValue = (config.withCredentials || isURLSameOrigin(fullPath)) && config.xsrfCookieName ?
	        cookies.read(config.xsrfCookieName) :
	        undefined;

	      if (xsrfValue) {
	        requestHeaders[config.xsrfHeaderName] = xsrfValue;
	      }
	    }

	    // Add headers to the request
	    if ('setRequestHeader' in request) {
	      utils.forEach(requestHeaders, function setRequestHeader(val, key) {
	        if (typeof requestData === 'undefined' && key.toLowerCase() === 'content-type') {
	          // Remove Content-Type if data is undefined
	          delete requestHeaders[key];
	        } else {
	          // Otherwise add header to the request
	          request.setRequestHeader(key, val);
	        }
	      });
	    }

	    // Add withCredentials to request if needed
	    if (!utils.isUndefined(config.withCredentials)) {
	      request.withCredentials = !!config.withCredentials;
	    }

	    // Add responseType to request if needed
	    if (responseType && responseType !== 'json') {
	      request.responseType = config.responseType;
	    }

	    // Handle progress if needed
	    if (typeof config.onDownloadProgress === 'function') {
	      request.addEventListener('progress', config.onDownloadProgress);
	    }

	    // Not all browsers support upload events
	    if (typeof config.onUploadProgress === 'function' && request.upload) {
	      request.upload.addEventListener('progress', config.onUploadProgress);
	    }

	    if (config.cancelToken || config.signal) {
	      // Handle cancellation
	      // eslint-disable-next-line func-names
	      onCanceled = function(cancel) {
	        if (!request) {
	          return;
	        }
	        reject(!cancel || (cancel && cancel.type) ? new CanceledError() : cancel);
	        request.abort();
	        request = null;
	      };

	      config.cancelToken && config.cancelToken.subscribe(onCanceled);
	      if (config.signal) {
	        config.signal.aborted ? onCanceled() : config.signal.addEventListener('abort', onCanceled);
	      }
	    }

	    if (!requestData) {
	      requestData = null;
	    }

	    var protocol = parseProtocol(fullPath);

	    if (protocol && [ 'http', 'https', 'file' ].indexOf(protocol) === -1) {
	      reject(new AxiosError('Unsupported protocol ' + protocol + ':', AxiosError.ERR_BAD_REQUEST, config));
	      return;
	    }


	    // Send the request
	    request.send(requestData);
	  });
	};
	return xhr;
}

var _null;
var hasRequired_null;

function require_null () {
	if (hasRequired_null) return _null;
	hasRequired_null = 1;
	// eslint-disable-next-line strict
	_null = null;
	return _null;
}

var utils$5 = utils$9;
var normalizeHeaderName = normalizeHeaderName$1;
var AxiosError$1 = requireAxiosError();
var transitionalDefaults = transitional;
var toFormData = requireToFormData();

var DEFAULT_CONTENT_TYPE = {
  'Content-Type': 'application/x-www-form-urlencoded'
};

function setContentTypeIfUnset(headers, value) {
  if (!utils$5.isUndefined(headers) && utils$5.isUndefined(headers['Content-Type'])) {
    headers['Content-Type'] = value;
  }
}

function getDefaultAdapter() {
  var adapter;
  if (typeof XMLHttpRequest !== 'undefined') {
    // For browsers use XHR adapter
    adapter = requireXhr();
  } else if (typeof process !== 'undefined' && Object.prototype.toString.call(process) === '[object process]') {
    // For node use HTTP adapter
    adapter = requireXhr();
  }
  return adapter;
}

function stringifySafely(rawValue, parser, encoder) {
  if (utils$5.isString(rawValue)) {
    try {
      (parser || JSON.parse)(rawValue);
      return utils$5.trim(rawValue);
    } catch (e) {
      if (e.name !== 'SyntaxError') {
        throw e;
      }
    }
  }

  return (encoder || JSON.stringify)(rawValue);
}

var defaults$3 = {

  transitional: transitionalDefaults,

  adapter: getDefaultAdapter(),

  transformRequest: [function transformRequest(data, headers) {
    normalizeHeaderName(headers, 'Accept');
    normalizeHeaderName(headers, 'Content-Type');

    if (utils$5.isFormData(data) ||
      utils$5.isArrayBuffer(data) ||
      utils$5.isBuffer(data) ||
      utils$5.isStream(data) ||
      utils$5.isFile(data) ||
      utils$5.isBlob(data)
    ) {
      return data;
    }
    if (utils$5.isArrayBufferView(data)) {
      return data.buffer;
    }
    if (utils$5.isURLSearchParams(data)) {
      setContentTypeIfUnset(headers, 'application/x-www-form-urlencoded;charset=utf-8');
      return data.toString();
    }

    var isObjectPayload = utils$5.isObject(data);
    var contentType = headers && headers['Content-Type'];

    var isFileList;

    if ((isFileList = utils$5.isFileList(data)) || (isObjectPayload && contentType === 'multipart/form-data')) {
      var _FormData = this.env && this.env.FormData;
      return toFormData(isFileList ? {'files[]': data} : data, _FormData && new _FormData());
    } else if (isObjectPayload || contentType === 'application/json') {
      setContentTypeIfUnset(headers, 'application/json');
      return stringifySafely(data);
    }

    return data;
  }],

  transformResponse: [function transformResponse(data) {
    var transitional = this.transitional || defaults$3.transitional;
    var silentJSONParsing = transitional && transitional.silentJSONParsing;
    var forcedJSONParsing = transitional && transitional.forcedJSONParsing;
    var strictJSONParsing = !silentJSONParsing && this.responseType === 'json';

    if (strictJSONParsing || (forcedJSONParsing && utils$5.isString(data) && data.length)) {
      try {
        return JSON.parse(data);
      } catch (e) {
        if (strictJSONParsing) {
          if (e.name === 'SyntaxError') {
            throw AxiosError$1.from(e, AxiosError$1.ERR_BAD_RESPONSE, this, null, this.response);
          }
          throw e;
        }
      }
    }

    return data;
  }],

  /**
   * A timeout in milliseconds to abort a request. If set to 0 (default) a
   * timeout is not created.
   */
  timeout: 0,

  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN',

  maxContentLength: -1,
  maxBodyLength: -1,

  env: {
    FormData: require_null()
  },

  validateStatus: function validateStatus(status) {
    return status >= 200 && status < 300;
  },

  headers: {
    common: {
      'Accept': 'application/json, text/plain, */*'
    }
  }
};

utils$5.forEach(['delete', 'get', 'head'], function forEachMethodNoData(method) {
  defaults$3.headers[method] = {};
});

utils$5.forEach(['post', 'put', 'patch'], function forEachMethodWithData(method) {
  defaults$3.headers[method] = utils$5.merge(DEFAULT_CONTENT_TYPE);
});

var defaults_1 = defaults$3;

var utils$4 = utils$9;
var defaults$2 = defaults_1;

/**
 * Transform the data for a request or a response
 *
 * @param {Object|String} data The data to be transformed
 * @param {Array} headers The headers for the request or response
 * @param {Array|Function} fns A single function or Array of functions
 * @returns {*} The resulting transformed data
 */
var transformData$1 = function transformData(data, headers, fns) {
  var context = this || defaults$2;
  /*eslint no-param-reassign:0*/
  utils$4.forEach(fns, function transform(fn) {
    data = fn.call(context, data, headers);
  });

  return data;
};

var isCancel$1;
var hasRequiredIsCancel;

function requireIsCancel () {
	if (hasRequiredIsCancel) return isCancel$1;
	hasRequiredIsCancel = 1;

	isCancel$1 = function isCancel(value) {
	  return !!(value && value.__CANCEL__);
	};
	return isCancel$1;
}

var utils$3 = utils$9;
var transformData = transformData$1;
var isCancel = requireIsCancel();
var defaults$1 = defaults_1;
var CanceledError = requireCanceledError();

/**
 * Throws a `CanceledError` if cancellation has been requested.
 */
function throwIfCancellationRequested(config) {
  if (config.cancelToken) {
    config.cancelToken.throwIfRequested();
  }

  if (config.signal && config.signal.aborted) {
    throw new CanceledError();
  }
}

/**
 * Dispatch a request to the server using the configured adapter.
 *
 * @param {object} config The config that is to be used for the request
 * @returns {Promise} The Promise to be fulfilled
 */
var dispatchRequest$1 = function dispatchRequest(config) {
  throwIfCancellationRequested(config);

  // Ensure headers exist
  config.headers = config.headers || {};

  // Transform request data
  config.data = transformData.call(
    config,
    config.data,
    config.headers,
    config.transformRequest
  );

  // Flatten headers
  config.headers = utils$3.merge(
    config.headers.common || {},
    config.headers[config.method] || {},
    config.headers
  );

  utils$3.forEach(
    ['delete', 'get', 'head', 'post', 'put', 'patch', 'common'],
    function cleanHeaderConfig(method) {
      delete config.headers[method];
    }
  );

  var adapter = config.adapter || defaults$1.adapter;

  return adapter(config).then(function onAdapterResolution(response) {
    throwIfCancellationRequested(config);

    // Transform response data
    response.data = transformData.call(
      config,
      response.data,
      response.headers,
      config.transformResponse
    );

    return response;
  }, function onAdapterRejection(reason) {
    if (!isCancel(reason)) {
      throwIfCancellationRequested(config);

      // Transform response data
      if (reason && reason.response) {
        reason.response.data = transformData.call(
          config,
          reason.response.data,
          reason.response.headers,
          config.transformResponse
        );
      }
    }

    return Promise.reject(reason);
  });
};

var utils$2 = utils$9;

/**
 * Config-specific merge-function which creates a new config-object
 * by merging two configuration objects together.
 *
 * @param {Object} config1
 * @param {Object} config2
 * @returns {Object} New object resulting from merging config2 to config1
 */
var mergeConfig$2 = function mergeConfig(config1, config2) {
  // eslint-disable-next-line no-param-reassign
  config2 = config2 || {};
  var config = {};

  function getMergedValue(target, source) {
    if (utils$2.isPlainObject(target) && utils$2.isPlainObject(source)) {
      return utils$2.merge(target, source);
    } else if (utils$2.isPlainObject(source)) {
      return utils$2.merge({}, source);
    } else if (utils$2.isArray(source)) {
      return source.slice();
    }
    return source;
  }

  // eslint-disable-next-line consistent-return
  function mergeDeepProperties(prop) {
    if (!utils$2.isUndefined(config2[prop])) {
      return getMergedValue(config1[prop], config2[prop]);
    } else if (!utils$2.isUndefined(config1[prop])) {
      return getMergedValue(undefined, config1[prop]);
    }
  }

  // eslint-disable-next-line consistent-return
  function valueFromConfig2(prop) {
    if (!utils$2.isUndefined(config2[prop])) {
      return getMergedValue(undefined, config2[prop]);
    }
  }

  // eslint-disable-next-line consistent-return
  function defaultToConfig2(prop) {
    if (!utils$2.isUndefined(config2[prop])) {
      return getMergedValue(undefined, config2[prop]);
    } else if (!utils$2.isUndefined(config1[prop])) {
      return getMergedValue(undefined, config1[prop]);
    }
  }

  // eslint-disable-next-line consistent-return
  function mergeDirectKeys(prop) {
    if (prop in config2) {
      return getMergedValue(config1[prop], config2[prop]);
    } else if (prop in config1) {
      return getMergedValue(undefined, config1[prop]);
    }
  }

  var mergeMap = {
    'url': valueFromConfig2,
    'method': valueFromConfig2,
    'data': valueFromConfig2,
    'baseURL': defaultToConfig2,
    'transformRequest': defaultToConfig2,
    'transformResponse': defaultToConfig2,
    'paramsSerializer': defaultToConfig2,
    'timeout': defaultToConfig2,
    'timeoutMessage': defaultToConfig2,
    'withCredentials': defaultToConfig2,
    'adapter': defaultToConfig2,
    'responseType': defaultToConfig2,
    'xsrfCookieName': defaultToConfig2,
    'xsrfHeaderName': defaultToConfig2,
    'onUploadProgress': defaultToConfig2,
    'onDownloadProgress': defaultToConfig2,
    'decompress': defaultToConfig2,
    'maxContentLength': defaultToConfig2,
    'maxBodyLength': defaultToConfig2,
    'beforeRedirect': defaultToConfig2,
    'transport': defaultToConfig2,
    'httpAgent': defaultToConfig2,
    'httpsAgent': defaultToConfig2,
    'cancelToken': defaultToConfig2,
    'socketPath': defaultToConfig2,
    'responseEncoding': defaultToConfig2,
    'validateStatus': mergeDirectKeys
  };

  utils$2.forEach(Object.keys(config1).concat(Object.keys(config2)), function computeConfigValue(prop) {
    var merge = mergeMap[prop] || mergeDeepProperties;
    var configValue = merge(prop);
    (utils$2.isUndefined(configValue) && merge !== mergeDirectKeys) || (config[prop] = configValue);
  });

  return config;
};

var data;
var hasRequiredData;

function requireData () {
	if (hasRequiredData) return data;
	hasRequiredData = 1;
	data = {
	  "version": "0.27.2"
	};
	return data;
}

var VERSION = requireData().version;
var AxiosError = requireAxiosError();

var validators$1 = {};

// eslint-disable-next-line func-names
['object', 'boolean', 'number', 'function', 'string', 'symbol'].forEach(function(type, i) {
  validators$1[type] = function validator(thing) {
    return typeof thing === type || 'a' + (i < 1 ? 'n ' : ' ') + type;
  };
});

var deprecatedWarnings = {};

/**
 * Transitional option validator
 * @param {function|boolean?} validator - set to false if the transitional option has been removed
 * @param {string?} version - deprecated version / removed since version
 * @param {string?} message - some message with additional info
 * @returns {function}
 */
validators$1.transitional = function transitional(validator, version, message) {
  function formatMessage(opt, desc) {
    return '[Axios v' + VERSION + '] Transitional option \'' + opt + '\'' + desc + (message ? '. ' + message : '');
  }

  // eslint-disable-next-line func-names
  return function(value, opt, opts) {
    if (validator === false) {
      throw new AxiosError(
        formatMessage(opt, ' has been removed' + (version ? ' in ' + version : '')),
        AxiosError.ERR_DEPRECATED
      );
    }

    if (version && !deprecatedWarnings[opt]) {
      deprecatedWarnings[opt] = true;
      // eslint-disable-next-line no-console
      console.warn(
        formatMessage(
          opt,
          ' has been deprecated since v' + version + ' and will be removed in the near future'
        )
      );
    }

    return validator ? validator(value, opt, opts) : true;
  };
};

/**
 * Assert object's properties type
 * @param {object} options
 * @param {object} schema
 * @param {boolean?} allowUnknown
 */

function assertOptions(options, schema, allowUnknown) {
  if (typeof options !== 'object') {
    throw new AxiosError('options must be an object', AxiosError.ERR_BAD_OPTION_VALUE);
  }
  var keys = Object.keys(options);
  var i = keys.length;
  while (i-- > 0) {
    var opt = keys[i];
    var validator = schema[opt];
    if (validator) {
      var value = options[opt];
      var result = value === undefined || validator(value, opt, options);
      if (result !== true) {
        throw new AxiosError('option ' + opt + ' must be ' + result, AxiosError.ERR_BAD_OPTION_VALUE);
      }
      continue;
    }
    if (allowUnknown !== true) {
      throw new AxiosError('Unknown option ' + opt, AxiosError.ERR_BAD_OPTION);
    }
  }
}

var validator$1 = {
  assertOptions: assertOptions,
  validators: validators$1
};

var utils$1 = utils$9;
var buildURL = buildURL$1;
var InterceptorManager = InterceptorManager_1;
var dispatchRequest = dispatchRequest$1;
var mergeConfig$1 = mergeConfig$2;
var buildFullPath = buildFullPath$1;
var validator = validator$1;

var validators = validator.validators;
/**
 * Create a new instance of Axios
 *
 * @param {Object} instanceConfig The default config for the instance
 */
function Axios$1(instanceConfig) {
  this.defaults = instanceConfig;
  this.interceptors = {
    request: new InterceptorManager(),
    response: new InterceptorManager()
  };
}

/**
 * Dispatch a request
 *
 * @param {Object} config The config specific for this request (merged with this.defaults)
 */
Axios$1.prototype.request = function request(configOrUrl, config) {
  /*eslint no-param-reassign:0*/
  // Allow for axios('example/url'[, config]) a la fetch API
  if (typeof configOrUrl === 'string') {
    config = config || {};
    config.url = configOrUrl;
  } else {
    config = configOrUrl || {};
  }

  config = mergeConfig$1(this.defaults, config);

  // Set config.method
  if (config.method) {
    config.method = config.method.toLowerCase();
  } else if (this.defaults.method) {
    config.method = this.defaults.method.toLowerCase();
  } else {
    config.method = 'get';
  }

  var transitional = config.transitional;

  if (transitional !== undefined) {
    validator.assertOptions(transitional, {
      silentJSONParsing: validators.transitional(validators.boolean),
      forcedJSONParsing: validators.transitional(validators.boolean),
      clarifyTimeoutError: validators.transitional(validators.boolean)
    }, false);
  }

  // filter out skipped interceptors
  var requestInterceptorChain = [];
  var synchronousRequestInterceptors = true;
  this.interceptors.request.forEach(function unshiftRequestInterceptors(interceptor) {
    if (typeof interceptor.runWhen === 'function' && interceptor.runWhen(config) === false) {
      return;
    }

    synchronousRequestInterceptors = synchronousRequestInterceptors && interceptor.synchronous;

    requestInterceptorChain.unshift(interceptor.fulfilled, interceptor.rejected);
  });

  var responseInterceptorChain = [];
  this.interceptors.response.forEach(function pushResponseInterceptors(interceptor) {
    responseInterceptorChain.push(interceptor.fulfilled, interceptor.rejected);
  });

  var promise;

  if (!synchronousRequestInterceptors) {
    var chain = [dispatchRequest, undefined];

    Array.prototype.unshift.apply(chain, requestInterceptorChain);
    chain = chain.concat(responseInterceptorChain);

    promise = Promise.resolve(config);
    while (chain.length) {
      promise = promise.then(chain.shift(), chain.shift());
    }

    return promise;
  }


  var newConfig = config;
  while (requestInterceptorChain.length) {
    var onFulfilled = requestInterceptorChain.shift();
    var onRejected = requestInterceptorChain.shift();
    try {
      newConfig = onFulfilled(newConfig);
    } catch (error) {
      onRejected(error);
      break;
    }
  }

  try {
    promise = dispatchRequest(newConfig);
  } catch (error) {
    return Promise.reject(error);
  }

  while (responseInterceptorChain.length) {
    promise = promise.then(responseInterceptorChain.shift(), responseInterceptorChain.shift());
  }

  return promise;
};

Axios$1.prototype.getUri = function getUri(config) {
  config = mergeConfig$1(this.defaults, config);
  var fullPath = buildFullPath(config.baseURL, config.url);
  return buildURL(fullPath, config.params, config.paramsSerializer);
};

// Provide aliases for supported request methods
utils$1.forEach(['delete', 'get', 'head', 'options'], function forEachMethodNoData(method) {
  /*eslint func-names:0*/
  Axios$1.prototype[method] = function(url, config) {
    return this.request(mergeConfig$1(config || {}, {
      method: method,
      url: url,
      data: (config || {}).data
    }));
  };
});

utils$1.forEach(['post', 'put', 'patch'], function forEachMethodWithData(method) {
  /*eslint func-names:0*/

  function generateHTTPMethod(isForm) {
    return function httpMethod(url, data, config) {
      return this.request(mergeConfig$1(config || {}, {
        method: method,
        headers: isForm ? {
          'Content-Type': 'multipart/form-data'
        } : {},
        url: url,
        data: data
      }));
    };
  }

  Axios$1.prototype[method] = generateHTTPMethod();

  Axios$1.prototype[method + 'Form'] = generateHTTPMethod(true);
});

var Axios_1 = Axios$1;

var CancelToken_1;
var hasRequiredCancelToken;

function requireCancelToken () {
	if (hasRequiredCancelToken) return CancelToken_1;
	hasRequiredCancelToken = 1;

	var CanceledError = requireCanceledError();

	/**
	 * A `CancelToken` is an object that can be used to request cancellation of an operation.
	 *
	 * @class
	 * @param {Function} executor The executor function.
	 */
	function CancelToken(executor) {
	  if (typeof executor !== 'function') {
	    throw new TypeError('executor must be a function.');
	  }

	  var resolvePromise;

	  this.promise = new Promise(function promiseExecutor(resolve) {
	    resolvePromise = resolve;
	  });

	  var token = this;

	  // eslint-disable-next-line func-names
	  this.promise.then(function(cancel) {
	    if (!token._listeners) return;

	    var i;
	    var l = token._listeners.length;

	    for (i = 0; i < l; i++) {
	      token._listeners[i](cancel);
	    }
	    token._listeners = null;
	  });

	  // eslint-disable-next-line func-names
	  this.promise.then = function(onfulfilled) {
	    var _resolve;
	    // eslint-disable-next-line func-names
	    var promise = new Promise(function(resolve) {
	      token.subscribe(resolve);
	      _resolve = resolve;
	    }).then(onfulfilled);

	    promise.cancel = function reject() {
	      token.unsubscribe(_resolve);
	    };

	    return promise;
	  };

	  executor(function cancel(message) {
	    if (token.reason) {
	      // Cancellation has already been requested
	      return;
	    }

	    token.reason = new CanceledError(message);
	    resolvePromise(token.reason);
	  });
	}

	/**
	 * Throws a `CanceledError` if cancellation has been requested.
	 */
	CancelToken.prototype.throwIfRequested = function throwIfRequested() {
	  if (this.reason) {
	    throw this.reason;
	  }
	};

	/**
	 * Subscribe to the cancel signal
	 */

	CancelToken.prototype.subscribe = function subscribe(listener) {
	  if (this.reason) {
	    listener(this.reason);
	    return;
	  }

	  if (this._listeners) {
	    this._listeners.push(listener);
	  } else {
	    this._listeners = [listener];
	  }
	};

	/**
	 * Unsubscribe from the cancel signal
	 */

	CancelToken.prototype.unsubscribe = function unsubscribe(listener) {
	  if (!this._listeners) {
	    return;
	  }
	  var index = this._listeners.indexOf(listener);
	  if (index !== -1) {
	    this._listeners.splice(index, 1);
	  }
	};

	/**
	 * Returns an object that contains a new `CancelToken` and a function that, when called,
	 * cancels the `CancelToken`.
	 */
	CancelToken.source = function source() {
	  var cancel;
	  var token = new CancelToken(function executor(c) {
	    cancel = c;
	  });
	  return {
	    token: token,
	    cancel: cancel
	  };
	};

	CancelToken_1 = CancelToken;
	return CancelToken_1;
}

var spread;
var hasRequiredSpread;

function requireSpread () {
	if (hasRequiredSpread) return spread;
	hasRequiredSpread = 1;

	/**
	 * Syntactic sugar for invoking a function and expanding an array for arguments.
	 *
	 * Common use case would be to use `Function.prototype.apply`.
	 *
	 *  ```js
	 *  function f(x, y, z) {}
	 *  var args = [1, 2, 3];
	 *  f.apply(null, args);
	 *  ```
	 *
	 * With `spread` this example can be re-written.
	 *
	 *  ```js
	 *  spread(function(x, y, z) {})([1, 2, 3]);
	 *  ```
	 *
	 * @param {Function} callback
	 * @returns {Function}
	 */
	spread = function spread(callback) {
	  return function wrap(arr) {
	    return callback.apply(null, arr);
	  };
	};
	return spread;
}

var isAxiosError;
var hasRequiredIsAxiosError;

function requireIsAxiosError () {
	if (hasRequiredIsAxiosError) return isAxiosError;
	hasRequiredIsAxiosError = 1;

	var utils = utils$9;

	/**
	 * Determines whether the payload is an error thrown by Axios
	 *
	 * @param {*} payload The value to test
	 * @returns {boolean} True if the payload is an error thrown by Axios, otherwise false
	 */
	isAxiosError = function isAxiosError(payload) {
	  return utils.isObject(payload) && (payload.isAxiosError === true);
	};
	return isAxiosError;
}

var utils = utils$9;
var bind = bind$2;
var Axios = Axios_1;
var mergeConfig = mergeConfig$2;
var defaults = defaults_1;

/**
 * Create an instance of Axios
 *
 * @param {Object} defaultConfig The default config for the instance
 * @return {Axios} A new instance of Axios
 */
function createInstance(defaultConfig) {
  var context = new Axios(defaultConfig);
  var instance = bind(Axios.prototype.request, context);

  // Copy axios.prototype to instance
  utils.extend(instance, Axios.prototype, context);

  // Copy context to instance
  utils.extend(instance, context);

  // Factory for creating new instances
  instance.create = function create(instanceConfig) {
    return createInstance(mergeConfig(defaultConfig, instanceConfig));
  };

  return instance;
}

// Create the default instance to be exported
var axios = createInstance(defaults);

// Expose Axios class to allow class inheritance
axios.Axios = Axios;

// Expose Cancel & CancelToken
axios.CanceledError = requireCanceledError();
axios.CancelToken = requireCancelToken();
axios.isCancel = requireIsCancel();
axios.VERSION = requireData().version;
axios.toFormData = requireToFormData();

// Expose AxiosError class
axios.AxiosError = requireAxiosError();

// alias for CanceledError for backward compatibility
axios.Cancel = axios.CanceledError;

// Expose all/spread
axios.all = function all(promises) {
  return Promise.all(promises);
};
axios.spread = requireSpread();

// Expose isAxiosError
axios.isAxiosError = requireIsAxiosError();

axios$1.exports = axios;

// Allow use of default import syntax in TypeScript
axios$1.exports.default = axios;

(function (module) {
	module.exports = axios$1.exports;
} (axios$2));

Object.defineProperty(api, "__esModule", { value: true });
const axios_1 = axios$2.exports;
class Api {
    constructor(config) {
        this.METHOD_GET = "GET";
        this.METHOD_POST = "POST";
        this.applyConfig(config);
    }
    applyConfig(config) {
        this.config = this.mergeDefaults(config);
    }
    getConfig() {
        return this.config;
    }
    mergeDefaults(config) {
        const protocol = config.protocol || "http";
        const port = config.port || (protocol === "https" ? 443 : 80);
        return {
            host: config.host || "127.0.0.1",
            protocol,
            port,
            timeout: config.timeout || 20000,
            logging: config.logging || false,
            logger: config.logger || console.log,
            network: config.network,
        };
    }
    async get(endpoint, config) {
        try {
            return await this.request().get(endpoint, config);
        }
        catch (error) {
            if (error.response && error.response.status) {
                return error.response;
            }
            throw error;
        }
    }
    async post(endpoint, body, config) {
        try {
            return await this.request().post(endpoint, body, config);
        }
        catch (error) {
            if (error.response && error.response.status) {
                return error.response;
            }
            throw error;
        }
    }
    /**
     * Get an AxiosInstance with the base configuration setup to fire off
     * a request to the network.
     */
    request() {
        const headers = {};
        if (this.config.network) {
            headers["x-network"] = this.config.network;
        }
        let instance = axios_1.default.create({
            baseURL: `${this.config.protocol}://${this.config.host}:${this.config.port}`,
            timeout: this.config.timeout,
            maxContentLength: 1024 * 1024 * 512,
            headers,
        });
        if (this.config.logging) {
            instance.interceptors.request.use((request) => {
                this.config.logger(`Requesting: ${request.baseURL}/${request.url}`);
                return request;
            });
            instance.interceptors.response.use((response) => {
                this.config.logger(`Response:   ${response.config.url} - ${response.status}`);
                return response;
            });
        }
        return instance;
    }
}
api.default = Api;

var webcryptoDriver = {};

Object.defineProperty(webcryptoDriver, "__esModule", { value: true });
const ArweaveUtils$3 = utils$a;
class WebCryptoDriver {
    constructor() {
        this.keyLength = 4096;
        this.publicExponent = 0x10001;
        this.hashAlgorithm = "sha256";
        if (!this.detectWebCrypto()) {
            throw new Error("SubtleCrypto not available!");
        }
        this.driver = crypto.subtle;
    }
    async generateJWK() {
        let cryptoKey = await this.driver.generateKey({
            name: "RSA-PSS",
            modulusLength: 4096,
            publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
            hash: {
                name: "SHA-256",
            },
        }, true, ["sign"]);
        let jwk = await this.driver.exportKey("jwk", cryptoKey.privateKey);
        return {
            kty: jwk.kty,
            e: jwk.e,
            n: jwk.n,
            d: jwk.d,
            p: jwk.p,
            q: jwk.q,
            dp: jwk.dp,
            dq: jwk.dq,
            qi: jwk.qi,
        };
    }
    async sign(jwk, data, { saltLength } = {}) {
        let signature = await this.driver.sign({
            name: "RSA-PSS",
            saltLength: 32,
        }, await this.jwkToCryptoKey(jwk), data);
        return new Uint8Array(signature);
    }
    async hash(data, algorithm = "SHA-256") {
        let digest = await this.driver.digest(algorithm, data);
        return new Uint8Array(digest);
    }
    async verify(publicModulus, data, signature) {
        const publicKey = {
            kty: "RSA",
            e: "AQAB",
            n: publicModulus,
        };
        const key = await this.jwkToPublicCryptoKey(publicKey);
        const verifyWith32 = this.driver.verify({
            name: "RSA-PSS",
            saltLength: 32,
        }, key, signature, data);
        const verifyWith0 = this.driver.verify({
            name: "RSA-PSS",
            saltLength: 0,
        }, key, signature, data);
        return verifyWith32 || verifyWith0;
    }
    async jwkToCryptoKey(jwk) {
        return this.driver.importKey("jwk", jwk, {
            name: "RSA-PSS",
            hash: {
                name: "SHA-256",
            },
        }, false, ["sign"]);
    }
    async jwkToPublicCryptoKey(publicJwk) {
        return this.driver.importKey("jwk", publicJwk, {
            name: "RSA-PSS",
            hash: {
                name: "SHA-256",
            },
        }, false, ["verify"]);
    }
    detectWebCrypto() {
        if (typeof crypto === "undefined") {
            return false;
        }
        const subtle = crypto === null || crypto === void 0 ? void 0 : crypto.subtle;
        if (subtle === undefined) {
            return false;
        }
        const names = [
            "generateKey",
            "importKey",
            "exportKey",
            "digest",
            "sign",
        ];
        return names.every((name) => typeof subtle[name] === "function");
    }
    async encrypt(data, key, salt) {
        const initialKey = await this.driver.importKey("raw", typeof key == "string" ? ArweaveUtils$3.stringToBuffer(key) : key, {
            name: "PBKDF2",
            length: 32,
        }, false, ["deriveKey"]);
        // const salt = ArweaveUtils.stringToBuffer("salt");
        // create a random string for deriving the key
        // const salt = this.driver.randomBytes(16).toString('hex');
        const derivedkey = await this.driver.deriveKey({
            name: "PBKDF2",
            salt: salt
                ? ArweaveUtils$3.stringToBuffer(salt)
                : ArweaveUtils$3.stringToBuffer("salt"),
            iterations: 100000,
            hash: "SHA-256",
        }, initialKey, {
            name: "AES-CBC",
            length: 256,
        }, false, ["encrypt", "decrypt"]);
        const iv = new Uint8Array(16);
        crypto.getRandomValues(iv);
        const encryptedData = await this.driver.encrypt({
            name: "AES-CBC",
            iv: iv,
        }, derivedkey, data);
        return ArweaveUtils$3.concatBuffers([iv, encryptedData]);
    }
    async decrypt(encrypted, key, salt) {
        const initialKey = await this.driver.importKey("raw", typeof key == "string" ? ArweaveUtils$3.stringToBuffer(key) : key, {
            name: "PBKDF2",
            length: 32,
        }, false, ["deriveKey"]);
        // const salt = ArweaveUtils.stringToBuffer("pepper");
        const derivedkey = await this.driver.deriveKey({
            name: "PBKDF2",
            salt: salt
                ? ArweaveUtils$3.stringToBuffer(salt)
                : ArweaveUtils$3.stringToBuffer("salt"),
            iterations: 100000,
            hash: "SHA-256",
        }, initialKey, {
            name: "AES-CBC",
            length: 256,
        }, false, ["encrypt", "decrypt"]);
        const iv = encrypted.slice(0, 16);
        const data = await this.driver.decrypt({
            name: "AES-CBC",
            iv: iv,
        }, derivedkey, encrypted.slice(16));
        // We're just using concat to convert from an array buffer to uint8array
        return ArweaveUtils$3.concatBuffers([data]);
    }
}
webcryptoDriver.default = WebCryptoDriver;

var network = {};

Object.defineProperty(network, "__esModule", { value: true });
class Network {
    constructor(api) {
        this.api = api;
    }
    getInfo() {
        return this.api.get(`info`).then((response) => {
            return response.data;
        });
    }
    getPeers() {
        return this.api.get(`peers`).then((response) => {
            return response.data;
        });
    }
}
network.default = Network;

var transactions = {};

var error = {};

Object.defineProperty(error, "__esModule", { value: true });
error.getError = void 0;
class ArweaveError extends Error {
    constructor(type, optional = {}) {
        if (optional.message) {
            super(optional.message);
        }
        else {
            super();
        }
        this.type = type;
        this.response = optional.response;
    }
    getType() {
        return this.type;
    }
}
error.default = ArweaveError;
// Safely get error string
// from an axios response, falling back to
// resp.data, statusText or 'unknown'.
// Note: a wrongly set content-type can
// cause what is a json response to be interepted
// as a string or Buffer, so we handle that too.
function getError(resp) {
    let data = resp.data;
    if (typeof resp.data === "string") {
        try {
            data = JSON.parse(resp.data);
        }
        catch (e) { }
    }
    if (resp.data instanceof ArrayBuffer || resp.data instanceof Uint8Array) {
        try {
            data = JSON.parse(data.toString());
        }
        catch (e) { }
    }
    return data ? data.error || data : resp.statusText || "unknown";
}
error.getError = getError;

var transactionUploader = {};

var merkle = {};

var hasRequiredMerkle;

function requireMerkle () {
	if (hasRequiredMerkle) return merkle;
	hasRequiredMerkle = 1;
	(function (exports) {
		Object.defineProperty(exports, "__esModule", { value: true });
		exports.debug = exports.validatePath = exports.arrayCompare = exports.bufferToInt = exports.intToBuffer = exports.arrayFlatten = exports.generateProofs = exports.buildLayers = exports.generateTransactionChunks = exports.generateTree = exports.computeRootHash = exports.generateLeaves = exports.chunkData = exports.MIN_CHUNK_SIZE = exports.MAX_CHUNK_SIZE = void 0;
		/**
		 * @see {@link https://github.com/ArweaveTeam/arweave/blob/fbc381e0e36efffa45d13f2faa6199d3766edaa2/apps/arweave/src/ar_merkle.erl}
		 */
		const common_1 = requireCommon();
		const utils_1 = utils$a;
		exports.MAX_CHUNK_SIZE = 256 * 1024;
		exports.MIN_CHUNK_SIZE = 32 * 1024;
		const NOTE_SIZE = 32;
		const HASH_SIZE = 32;
		/**
		 * Takes the input data and chunks it into (mostly) equal sized chunks.
		 * The last chunk will be a bit smaller as it contains the remainder
		 * from the chunking process.
		 */
		async function chunkData(data) {
		    let chunks = [];
		    let rest = data;
		    let cursor = 0;
		    while (rest.byteLength >= exports.MAX_CHUNK_SIZE) {
		        let chunkSize = exports.MAX_CHUNK_SIZE;
		        // If the total bytes left will produce a chunk < MIN_CHUNK_SIZE,
		        // then adjust the amount we put in this 2nd last chunk.
		        let nextChunkSize = rest.byteLength - exports.MAX_CHUNK_SIZE;
		        if (nextChunkSize > 0 && nextChunkSize < exports.MIN_CHUNK_SIZE) {
		            chunkSize = Math.ceil(rest.byteLength / 2);
		            // console.log(`Last chunk will be: ${nextChunkSize} which is below ${MIN_CHUNK_SIZE}, adjusting current to ${chunkSize} with ${rest.byteLength} left.`)
		        }
		        const chunk = rest.slice(0, chunkSize);
		        const dataHash = await common_1.default.crypto.hash(chunk);
		        cursor += chunk.byteLength;
		        chunks.push({
		            dataHash,
		            minByteRange: cursor - chunk.byteLength,
		            maxByteRange: cursor,
		        });
		        rest = rest.slice(chunkSize);
		    }
		    chunks.push({
		        dataHash: await common_1.default.crypto.hash(rest),
		        minByteRange: cursor,
		        maxByteRange: cursor + rest.byteLength,
		    });
		    return chunks;
		}
		exports.chunkData = chunkData;
		async function generateLeaves(chunks) {
		    return Promise.all(chunks.map(async ({ dataHash, minByteRange, maxByteRange }) => {
		        return {
		            type: "leaf",
		            id: await hash(await Promise.all([hash(dataHash), hash(intToBuffer(maxByteRange))])),
		            dataHash: dataHash,
		            minByteRange,
		            maxByteRange,
		        };
		    }));
		}
		exports.generateLeaves = generateLeaves;
		/**
		 * Builds an arweave merkle tree and gets the root hash for the given input.
		 */
		async function computeRootHash(data) {
		    const rootNode = await generateTree(data);
		    return rootNode.id;
		}
		exports.computeRootHash = computeRootHash;
		async function generateTree(data) {
		    const rootNode = await buildLayers(await generateLeaves(await chunkData(data)));
		    return rootNode;
		}
		exports.generateTree = generateTree;
		/**
		 * Generates the data_root, chunks & proofs
		 * needed for a transaction.
		 *
		 * This also checks if the last chunk is a zero-length
		 * chunk and discards that chunk and proof if so.
		 * (we do not need to upload this zero length chunk)
		 *
		 * @param data
		 */
		async function generateTransactionChunks(data) {
		    const chunks = await chunkData(data);
		    const leaves = await generateLeaves(chunks);
		    const root = await buildLayers(leaves);
		    const proofs = await generateProofs(root);
		    // Discard the last chunk & proof if it's zero length.
		    const lastChunk = chunks.slice(-1)[0];
		    if (lastChunk.maxByteRange - lastChunk.minByteRange === 0) {
		        chunks.splice(chunks.length - 1, 1);
		        proofs.splice(proofs.length - 1, 1);
		    }
		    return {
		        data_root: root.id,
		        chunks,
		        proofs,
		    };
		}
		exports.generateTransactionChunks = generateTransactionChunks;
		/**
		 * Starting with the bottom layer of leaf nodes, hash every second pair
		 * into a new branch node, push those branch nodes onto a new layer,
		 * and then recurse, building up the tree to it's root, where the
		 * layer only consists of two items.
		 */
		async function buildLayers(nodes, level = 0) {
		    // If there is only 1 node left, this is going to be the root node
		    if (nodes.length < 2) {
		        const root = nodes[0];
		        // console.log("Root layer", root);
		        return root;
		    }
		    const nextLayer = [];
		    for (let i = 0; i < nodes.length; i += 2) {
		        nextLayer.push(await hashBranch(nodes[i], nodes[i + 1]));
		    }
		    // console.log("Layer", nextLayer);
		    return buildLayers(nextLayer, level + 1);
		}
		exports.buildLayers = buildLayers;
		/**
		 * Recursively search through all branches of the tree,
		 * and generate a proof for each leaf node.
		 */
		function generateProofs(root) {
		    const proofs = resolveBranchProofs(root);
		    if (!Array.isArray(proofs)) {
		        return [proofs];
		    }
		    return arrayFlatten(proofs);
		}
		exports.generateProofs = generateProofs;
		function resolveBranchProofs(node, proof = new Uint8Array(), depth = 0) {
		    if (node.type == "leaf") {
		        return {
		            offset: node.maxByteRange - 1,
		            proof: (0, utils_1.concatBuffers)([
		                proof,
		                node.dataHash,
		                intToBuffer(node.maxByteRange),
		            ]),
		        };
		    }
		    if (node.type == "branch") {
		        const partialProof = (0, utils_1.concatBuffers)([
		            proof,
		            node.leftChild.id,
		            node.rightChild.id,
		            intToBuffer(node.byteRange),
		        ]);
		        return [
		            resolveBranchProofs(node.leftChild, partialProof, depth + 1),
		            resolveBranchProofs(node.rightChild, partialProof, depth + 1),
		        ];
		    }
		    throw new Error(`Unexpected node type`);
		}
		function arrayFlatten(input) {
		    const flat = [];
		    input.forEach((item) => {
		        if (Array.isArray(item)) {
		            flat.push(...arrayFlatten(item));
		        }
		        else {
		            flat.push(item);
		        }
		    });
		    return flat;
		}
		exports.arrayFlatten = arrayFlatten;
		async function hashBranch(left, right) {
		    if (!right) {
		        return left;
		    }
		    let branch = {
		        type: "branch",
		        id: await hash([
		            await hash(left.id),
		            await hash(right.id),
		            await hash(intToBuffer(left.maxByteRange)),
		        ]),
		        byteRange: left.maxByteRange,
		        maxByteRange: right.maxByteRange,
		        leftChild: left,
		        rightChild: right,
		    };
		    return branch;
		}
		async function hash(data) {
		    if (Array.isArray(data)) {
		        data = common_1.default.utils.concatBuffers(data);
		    }
		    return new Uint8Array(await common_1.default.crypto.hash(data));
		}
		function intToBuffer(note) {
		    const buffer = new Uint8Array(NOTE_SIZE);
		    for (var i = buffer.length - 1; i >= 0; i--) {
		        var byte = note % 256;
		        buffer[i] = byte;
		        note = (note - byte) / 256;
		    }
		    return buffer;
		}
		exports.intToBuffer = intToBuffer;
		function bufferToInt(buffer) {
		    let value = 0;
		    for (var i = 0; i < buffer.length; i++) {
		        value *= 256;
		        value += buffer[i];
		    }
		    return value;
		}
		exports.bufferToInt = bufferToInt;
		const arrayCompare = (a, b) => a.every((value, index) => b[index] === value);
		exports.arrayCompare = arrayCompare;
		async function validatePath(id, dest, leftBound, rightBound, path) {
		    if (rightBound <= 0) {
		        return false;
		    }
		    if (dest >= rightBound) {
		        return validatePath(id, 0, rightBound - 1, rightBound, path);
		    }
		    if (dest < 0) {
		        return validatePath(id, 0, 0, rightBound, path);
		    }
		    if (path.length == HASH_SIZE + NOTE_SIZE) {
		        const pathData = path.slice(0, HASH_SIZE);
		        const endOffsetBuffer = path.slice(pathData.length, pathData.length + NOTE_SIZE);
		        const pathDataHash = await hash([
		            await hash(pathData),
		            await hash(endOffsetBuffer),
		        ]);
		        let result = (0, exports.arrayCompare)(id, pathDataHash);
		        if (result) {
		            return {
		                offset: rightBound - 1,
		                leftBound: leftBound,
		                rightBound: rightBound,
		                chunkSize: rightBound - leftBound,
		            };
		        }
		        return false;
		    }
		    const left = path.slice(0, HASH_SIZE);
		    const right = path.slice(left.length, left.length + HASH_SIZE);
		    const offsetBuffer = path.slice(left.length + right.length, left.length + right.length + NOTE_SIZE);
		    const offset = bufferToInt(offsetBuffer);
		    const remainder = path.slice(left.length + right.length + offsetBuffer.length);
		    const pathHash = await hash([
		        await hash(left),
		        await hash(right),
		        await hash(offsetBuffer),
		    ]);
		    if ((0, exports.arrayCompare)(id, pathHash)) {
		        if (dest < offset) {
		            return await validatePath(left, dest, leftBound, Math.min(rightBound, offset), remainder);
		        }
		        return await validatePath(right, dest, Math.max(leftBound, offset), rightBound, remainder);
		    }
		    return false;
		}
		exports.validatePath = validatePath;
		/**
		 * Inspect an arweave chunk proof.
		 * Takes proof, parses, reads and displays the values for console logging.
		 * One proof section per line
		 * Format: left,right,offset => hash
		 */
		async function debug(proof, output = "") {
		    if (proof.byteLength < 1) {
		        return output;
		    }
		    const left = proof.slice(0, HASH_SIZE);
		    const right = proof.slice(left.length, left.length + HASH_SIZE);
		    const offsetBuffer = proof.slice(left.length + right.length, left.length + right.length + NOTE_SIZE);
		    const offset = bufferToInt(offsetBuffer);
		    const remainder = proof.slice(left.length + right.length + offsetBuffer.length);
		    const pathHash = await hash([
		        await hash(left),
		        await hash(right),
		        await hash(offsetBuffer),
		    ]);
		    const updatedOutput = `${output}\n${JSON.stringify(Buffer.from(left))},${JSON.stringify(Buffer.from(right))},${offset} => ${JSON.stringify(pathHash)}`;
		    return debug(remainder, updatedOutput);
		}
		exports.debug = debug;
		
} (merkle));
	return merkle;
}

var hasRequiredTransactionUploader;

function requireTransactionUploader () {
	if (hasRequiredTransactionUploader) return transactionUploader;
	hasRequiredTransactionUploader = 1;
	Object.defineProperty(transactionUploader, "__esModule", { value: true });
	transactionUploader.TransactionUploader = void 0;
	const transaction_1 = requireTransaction();
	const ArweaveUtils = utils$a;
	const error_1 = error;
	const merkle_1 = requireMerkle();
	// Maximum amount of chunks we will upload in the body.
	const MAX_CHUNKS_IN_BODY = 1;
	// We assume these errors are intermitment and we can try again after a delay:
	// - not_joined
	// - timeout
	// - data_root_not_found (we may have hit a node that just hasn't seen it yet)
	// - exceeds_disk_pool_size_limit
	// We also try again after any kind of unexpected network errors
	// Errors from /chunk we should never try and continue on.
	const FATAL_CHUNK_UPLOAD_ERRORS = [
	    "invalid_json",
	    "chunk_too_big",
	    "data_path_too_big",
	    "offset_too_big",
	    "data_size_too_big",
	    "chunk_proof_ratio_not_attractive",
	    "invalid_proof",
	];
	// Amount we will delay on receiving an error response but do want to continue.
	const ERROR_DELAY = 1000 * 40;
	class TransactionUploader {
	    constructor(api, transaction) {
	        this.api = api;
	        this.chunkIndex = 0;
	        this.txPosted = false;
	        this.lastRequestTimeEnd = 0;
	        this.totalErrors = 0; // Not serialized.
	        this.lastResponseStatus = 0;
	        this.lastResponseError = "";
	        if (!transaction.id) {
	            throw new Error(`Transaction is not signed`);
	        }
	        if (!transaction.chunks) {
	            throw new Error(`Transaction chunks not prepared`);
	        }
	        // Make a copy of transaction, zeroing the data so we can serialize.
	        this.data = transaction.data;
	        this.transaction = new transaction_1.default(Object.assign({}, transaction, { data: new Uint8Array(0) }));
	    }
	    get isComplete() {
	        return (this.txPosted &&
	            this.chunkIndex === this.transaction.chunks.chunks.length);
	    }
	    get totalChunks() {
	        return this.transaction.chunks.chunks.length;
	    }
	    get uploadedChunks() {
	        return this.chunkIndex;
	    }
	    get pctComplete() {
	        return Math.trunc((this.uploadedChunks / this.totalChunks) * 100);
	    }
	    /**
	     * Uploads the next part of the transaction.
	     * On the first call this posts the transaction
	     * itself and on any subsequent calls uploads the
	     * next chunk until it completes.
	     */
	    async uploadChunk(chunkIndex_) {
	        if (this.isComplete) {
	            throw new Error(`Upload is already complete`);
	        }
	        if (this.lastResponseError !== "") {
	            this.totalErrors++;
	        }
	        else {
	            this.totalErrors = 0;
	        }
	        // We have been trying for about an hour receiving an
	        // error every time, so eventually bail.
	        if (this.totalErrors === 100) {
	            throw new Error(`Unable to complete upload: ${this.lastResponseStatus}: ${this.lastResponseError}`);
	        }
	        let delay = this.lastResponseError === ""
	            ? 0
	            : Math.max(this.lastRequestTimeEnd + ERROR_DELAY - Date.now(), ERROR_DELAY);
	        if (delay > 0) {
	            // Jitter delay bcoz networks, subtract up to 30% from 40 seconds
	            delay = delay - delay * Math.random() * 0.3;
	            await new Promise((res) => setTimeout(res, delay));
	        }
	        this.lastResponseError = "";
	        if (!this.txPosted) {
	            await this.postTransaction();
	            return;
	        }
	        if (chunkIndex_) {
	            this.chunkIndex = chunkIndex_;
	        }
	        const chunk = this.transaction.getChunk(chunkIndex_ || this.chunkIndex, this.data);
	        const chunkOk = await (0, merkle_1.validatePath)(this.transaction.chunks.data_root, parseInt(chunk.offset), 0, parseInt(chunk.data_size), ArweaveUtils.b64UrlToBuffer(chunk.data_path));
	        if (!chunkOk) {
	            throw new Error(`Unable to validate chunk ${this.chunkIndex}`);
	        }
	        // Catch network errors and turn them into objects with status -1 and an error message.
	        const resp = await this.api
	            .post(`chunk`, this.transaction.getChunk(this.chunkIndex, this.data))
	            .catch((e) => {
	            console.error(e.message);
	            return { status: -1, data: { error: e.message } };
	        });
	        this.lastRequestTimeEnd = Date.now();
	        this.lastResponseStatus = resp.status;
	        if (this.lastResponseStatus == 200) {
	            this.chunkIndex++;
	        }
	        else {
	            this.lastResponseError = (0, error_1.getError)(resp);
	            if (FATAL_CHUNK_UPLOAD_ERRORS.includes(this.lastResponseError)) {
	                throw new Error(`Fatal error uploading chunk ${this.chunkIndex}: ${this.lastResponseError}`);
	            }
	        }
	    }
	    /**
	     * Reconstructs an upload from its serialized state and data.
	     * Checks if data matches the expected data_root.
	     *
	     * @param serialized
	     * @param data
	     */
	    static async fromSerialized(api, serialized, data) {
	        if (!serialized ||
	            typeof serialized.chunkIndex !== "number" ||
	            typeof serialized.transaction !== "object") {
	            throw new Error(`Serialized object does not match expected format.`);
	        }
	        // Everything looks ok, reconstruct the TransactionUpload,
	        // prepare the chunks again and verify the data_root matches
	        var transaction = new transaction_1.default(serialized.transaction);
	        if (!transaction.chunks) {
	            await transaction.prepareChunks(data);
	        }
	        const upload = new TransactionUploader(api, transaction);
	        // Copy the serialized upload information, and data passed in.
	        upload.chunkIndex = serialized.chunkIndex;
	        upload.lastRequestTimeEnd = serialized.lastRequestTimeEnd;
	        upload.lastResponseError = serialized.lastResponseError;
	        upload.lastResponseStatus = serialized.lastResponseStatus;
	        upload.txPosted = serialized.txPosted;
	        upload.data = data;
	        if (upload.transaction.data_root !== serialized.transaction.data_root) {
	            throw new Error(`Data mismatch: Uploader doesn't match provided data.`);
	        }
	        return upload;
	    }
	    /**
	     * Reconstruct an upload from the tx metadata, ie /tx/<id>.
	     *
	     * @param api
	     * @param id
	     * @param data
	     */
	    static async fromTransactionId(api, id) {
	        const resp = await api.get(`tx/${id}`);
	        if (resp.status !== 200) {
	            throw new Error(`Tx ${id} not found: ${resp.status}`);
	        }
	        const transaction = resp.data;
	        transaction.data = new Uint8Array(0);
	        const serialized = {
	            txPosted: true,
	            chunkIndex: 0,
	            lastResponseError: "",
	            lastRequestTimeEnd: 0,
	            lastResponseStatus: 0,
	            transaction,
	        };
	        return serialized;
	    }
	    toJSON() {
	        return {
	            chunkIndex: this.chunkIndex,
	            transaction: this.transaction,
	            lastRequestTimeEnd: this.lastRequestTimeEnd,
	            lastResponseStatus: this.lastResponseStatus,
	            lastResponseError: this.lastResponseError,
	            txPosted: this.txPosted,
	        };
	    }
	    // POST to /tx
	    async postTransaction() {
	        const uploadInBody = this.totalChunks <= MAX_CHUNKS_IN_BODY;
	        if (uploadInBody) {
	            // Post the transaction with data.
	            this.transaction.data = this.data;
	            const resp = await this.api.post(`tx`, this.transaction).catch((e) => {
	                console.error(e);
	                return { status: -1, data: { error: e.message } };
	            });
	            this.lastRequestTimeEnd = Date.now();
	            this.lastResponseStatus = resp.status;
	            this.transaction.data = new Uint8Array(0);
	            if (resp.status >= 200 && resp.status < 300) {
	                // We are complete.
	                this.txPosted = true;
	                this.chunkIndex = MAX_CHUNKS_IN_BODY;
	                return;
	            }
	            this.lastResponseError = (0, error_1.getError)(resp);
	            throw new Error(`Unable to upload transaction: ${resp.status}, ${this.lastResponseError}`);
	        }
	        // Post the transaction with no data.
	        const resp = await this.api.post(`tx`, this.transaction);
	        this.lastRequestTimeEnd = Date.now();
	        this.lastResponseStatus = resp.status;
	        if (!(resp.status >= 200 && resp.status < 300)) {
	            this.lastResponseError = (0, error_1.getError)(resp);
	            throw new Error(`Unable to upload transaction: ${resp.status}, ${this.lastResponseError}`);
	        }
	        this.txPosted = true;
	    }
	}
	transactionUploader.TransactionUploader = TransactionUploader;
	
	return transactionUploader;
}

var hasRequiredTransactions;

function requireTransactions () {
	if (hasRequiredTransactions) return transactions;
	hasRequiredTransactions = 1;
	var __await = (commonjsGlobal && commonjsGlobal.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); };
	var __asyncGenerator = (commonjsGlobal && commonjsGlobal.__asyncGenerator) || function (thisArg, _arguments, generator) {
	    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
	    var g = generator.apply(thisArg, _arguments || []), i, q = [];
	    return i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i;
	    function verb(n) { if (g[n]) i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; }
	    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
	    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
	    function fulfill(value) { resume("next", value); }
	    function reject(value) { resume("throw", value); }
	    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
	};
	Object.defineProperty(transactions, "__esModule", { value: true });
	const error_1 = error;
	const transaction_1 = requireTransaction();
	const ArweaveUtils = utils$a;
	const transaction_uploader_1 = requireTransactionUploader();

	class Transactions {
	    constructor(api, crypto, chunks) {
	        this.api = api;
	        this.crypto = crypto;
	        this.chunks = chunks;
	    }
	    getTransactionAnchor() {
	        /**
	         * Maintain compatibility with erdjs which sets a global axios.defaults.transformResponse
	         * in order to overcome some other issue in:  https://github.com/axios/axios/issues/983
	         *
	         * However, this introduces a problem with ardrive-js, so we will enforce
	         * config =  {transformResponse: []} where we do not require a transform
	         */
	        return this.api
	            .get(`tx_anchor`, { transformResponse: [] })
	            .then((response) => {
	            return response.data;
	        });
	    }
	    getPrice(byteSize, targetAddress) {
	        let endpoint = targetAddress
	            ? `price/${byteSize}/${targetAddress}`
	            : `price/${byteSize}`;
	        return this.api
	            .get(endpoint, {
	            transformResponse: [
	                /**
	                 * We need to specify a response transformer to override
	                 * the default JSON.parse behavior, as this causes
	                 * winston to be converted to a number and we want to
	                 * return it as a winston string.
	                 * @param data
	                 */
	                function (data) {
	                    return data;
	                },
	            ],
	        })
	            .then((response) => {
	            return response.data;
	        });
	    }
	    async get(id) {
	        const response = await this.api.get(`tx/${id}`);
	        if (response.status == 200) {
	            const data_size = parseInt(response.data.data_size);
	            if (response.data.format >= 2 &&
	                data_size > 0 &&
	                data_size <= 1024 * 1024 * 12) {
	                const data = await this.getData(id);
	                return new transaction_1.default(Object.assign(Object.assign({}, response.data), { data }));
	            }
	            return new transaction_1.default(Object.assign(Object.assign({}, response.data), { format: response.data.format || 1 }));
	        }
	        if (response.status == 404) {
	            throw new error_1.default("TX_NOT_FOUND" /* ArweaveErrorType.TX_NOT_FOUND */);
	        }
	        if (response.status == 410) {
	            throw new error_1.default("TX_FAILED" /* ArweaveErrorType.TX_FAILED */);
	        }
	        throw new error_1.default("TX_INVALID" /* ArweaveErrorType.TX_INVALID */);
	    }
	    fromRaw(attributes) {
	        return new transaction_1.default(attributes);
	    }
	    async search(tagName, tagValue) {
	        return this.api
	            .post(`arql`, {
	            op: "equals",
	            expr1: tagName,
	            expr2: tagValue,
	        })
	            .then((response) => {
	            if (!response.data) {
	                return [];
	            }
	            return response.data;
	        });
	    }
	    getStatus(id) {
	        return this.api.get(`tx/${id}/status`).then((response) => {
	            if (response.status == 200) {
	                return {
	                    status: 200,
	                    confirmed: response.data,
	                };
	            }
	            return {
	                status: response.status,
	                confirmed: null,
	            };
	        });
	    }
	    async getData(id, options) {
	        let data = undefined;
	        try {
	            data = await this.chunks.downloadChunkedData(id);
	        }
	        catch (error) {
	            console.error(`Error while trying to download chunked data for ${id}`);
	            console.error(error);
	        }
	        if (!data) {
	            console.warn(`Falling back to gateway cache for ${id}`);
	            try {
	                data = (await this.api.get(`/${id}`)).data;
	            }
	            catch (error) {
	                console.error(`Error while trying to download contiguous data from gateway cache for ${id}`);
	                console.error(error);
	            }
	        }
	        if (!data) {
	            throw new Error(`${id} was not found!`);
	        }
	        if (options && options.decode && !options.string) {
	            return data;
	        }
	        if (options && options.decode && options.string) {
	            return ArweaveUtils.bufferToString(data);
	        }
	        // Since decode wasn't requested, caller expects b64url encoded data.
	        return ArweaveUtils.bufferTob64Url(data);
	    }
	    async sign(transaction, jwk, options) {
	        if (!jwk && (typeof window === "undefined" || !window.arweaveWallet)) {
	            throw new Error(`A new Arweave transaction must provide the jwk parameter.`);
	        }
	        else if (!jwk || jwk === "use_wallet") {
	            try {
	                const existingPermissions = await window.arweaveWallet.getPermissions();
	                if (!existingPermissions.includes("SIGN_TRANSACTION"))
	                    await window.arweaveWallet.connect(["SIGN_TRANSACTION"]);
	            }
	            catch (_a) {
	                // Permission is already granted
	            }
	            const signedTransaction = await window.arweaveWallet.sign(transaction, options);
	            transaction.setSignature({
	                id: signedTransaction.id,
	                owner: signedTransaction.owner,
	                reward: signedTransaction.reward,
	                tags: signedTransaction.tags,
	                signature: signedTransaction.signature,
	            });
	        }
	        else {
	            transaction.setOwner(jwk.n);
	            let dataToSign = await transaction.getSignatureData();
	            let rawSignature = await this.crypto.sign(jwk, dataToSign, options);
	            let id = await this.crypto.hash(rawSignature);
	            transaction.setSignature({
	                id: ArweaveUtils.bufferTob64Url(id),
	                owner: jwk.n,
	                signature: ArweaveUtils.bufferTob64Url(rawSignature),
	            });
	        }
	    }
	    async verify(transaction) {
	        const signaturePayload = await transaction.getSignatureData();
	        /**
	         * The transaction ID should be a SHA-256 hash of the raw signature bytes, so this needs
	         * to be recalculated from the signature and checked against the transaction ID.
	         */
	        const rawSignature = transaction.get("signature", {
	            decode: true,
	            string: false,
	        });
	        const expectedId = ArweaveUtils.bufferTob64Url(await this.crypto.hash(rawSignature));
	        if (transaction.id !== expectedId) {
	            throw new Error(`Invalid transaction signature or ID! The transaction ID doesn't match the expected SHA-256 hash of the signature.`);
	        }
	        /**
	         * Now verify the signature is valid and signed by the owner wallet (owner field = originating wallet public key).
	         */
	        return this.crypto.verify(transaction.owner, signaturePayload, rawSignature);
	    }
	    async post(transaction) {
	        if (typeof transaction === "string") {
	            transaction = new transaction_1.default(JSON.parse(transaction));
	        }
	        else if (typeof transaction.readInt32BE === "function") {
	            transaction = new transaction_1.default(JSON.parse(transaction.toString()));
	        }
	        else if (typeof transaction === "object" &&
	            !(transaction instanceof transaction_1.default)) {
	            transaction = new transaction_1.default(transaction);
	        }
	        if (!(transaction instanceof transaction_1.default)) {
	            throw new Error(`Must be Transaction object`);
	        }
	        if (!transaction.chunks) {
	            await transaction.prepareChunks(transaction.data);
	        }
	        const uploader = await this.getUploader(transaction, transaction.data);
	        // Emulate existing error & return value behavior.
	        try {
	            while (!uploader.isComplete) {
	                await uploader.uploadChunk();
	            }
	        }
	        catch (e) {
	            if (uploader.lastResponseStatus > 0) {
	                return {
	                    status: uploader.lastResponseStatus,
	                    statusText: uploader.lastResponseError,
	                    data: {
	                        error: uploader.lastResponseError,
	                    },
	                };
	            }
	            throw e;
	        }
	        return {
	            status: 200,
	            statusText: "OK",
	            data: {},
	        };
	    }
	    /**
	     * Gets an uploader than can be used to upload a transaction chunk by chunk, giving progress
	     * and the ability to resume.
	     *
	     * Usage example:
	     *
	     * ```
	     * const uploader = arweave.transactions.getUploader(transaction);
	     * while (!uploader.isComplete) {
	     *   await uploader.uploadChunk();
	     *   console.log(`${uploader.pctComplete}%`);
	     * }
	     * ```
	     *
	     * @param upload a Transaction object, a previously save progress object, or a transaction id.
	     * @param data the data of the transaction. Required when resuming an upload.
	     */
	    async getUploader(upload, data) {
	        let uploader;
	        if (data instanceof ArrayBuffer) {
	            data = new Uint8Array(data);
	        }
	        if (upload instanceof transaction_1.default) {
	            if (!data) {
	                data = upload.data;
	            }
	            if (!(data instanceof Uint8Array)) {
	                throw new Error("Data format is invalid");
	            }
	            if (!upload.chunks) {
	                await upload.prepareChunks(data);
	            }
	            uploader = new transaction_uploader_1.TransactionUploader(this.api, upload);
	            if (!uploader.data || uploader.data.length === 0) {
	                uploader.data = data;
	            }
	        }
	        else {
	            if (typeof upload === "string") {
	                upload = await transaction_uploader_1.TransactionUploader.fromTransactionId(this.api, upload);
	            }
	            if (!data || !(data instanceof Uint8Array)) {
	                throw new Error(`Must provide data when resuming upload`);
	            }
	            // upload should be a serialized upload.
	            uploader = await transaction_uploader_1.TransactionUploader.fromSerialized(this.api, upload, data);
	        }
	        return uploader;
	    }
	    /**
	     * Async generator version of uploader
	     *
	     * Usage example:
	     *
	     * ```
	     * for await (const uploader of arweave.transactions.upload(tx)) {
	     *  console.log(`${uploader.pctComplete}%`);
	     * }
	     * ```
	     *
	     * @param upload a Transaction object, a previously save uploader, or a transaction id.
	     * @param data the data of the transaction. Required when resuming an upload.
	     */
	    upload(upload, data) {
	        return __asyncGenerator(this, arguments, function* upload_1() {
	            const uploader = yield __await(this.getUploader(upload, data));
	            while (!uploader.isComplete) {
	                yield __await(uploader.uploadChunk());
	                yield yield __await(uploader);
	            }
	            return yield __await(uploader);
	        });
	    }
	}
	transactions.default = Transactions;
	
	return transactions;
}

var wallets = {};

Object.defineProperty(wallets, "__esModule", { value: true });
const ArweaveUtils$2 = utils$a;

class Wallets {
    constructor(api, crypto) {
        this.api = api;
        this.crypto = crypto;
    }
    /**
     * Get the wallet balance for the given address.
     *
     * @param {string} address - The arweave address to get the balance for.
     *
     * @returns {Promise<string>} - Promise which resolves with a winston string balance.
     */
    getBalance(address) {
        return this.api
            .get(`wallet/${address}/balance`, {
            transformResponse: [
                /**
                 * We need to specify a response transformer to override
                 * the default JSON.parse behaviour, as this causes
                 * balances to be converted to a number and we want to
                 * return it as a winston string.
                 * @param data
                 */
                function (data) {
                    return data;
                },
            ],
        })
            .then((response) => {
            return response.data;
        });
    }
    /**
     * Get the last transaction ID for the given wallet address.
     *
     * @param {string} address - The arweave address to get the transaction for.
     *
     * @returns {Promise<string>} - Promise which resolves with a transaction ID.
     */
    getLastTransactionID(address) {
        return this.api.get(`wallet/${address}/last_tx`).then((response) => {
            return response.data;
        });
    }
    generate() {
        return this.crypto.generateJWK();
    }
    async jwkToAddress(jwk) {
        if (!jwk || jwk === "use_wallet") {
            return this.getAddress();
        }
        else {
            return this.getAddress(jwk);
        }
    }
    async getAddress(jwk) {
        if (!jwk || jwk === "use_wallet") {
            try {
                // @ts-ignore
                await window.arweaveWallet.connect(["ACCESS_ADDRESS"]);
            }
            catch (_a) {
                // Permission is already granted
            }
            // @ts-ignore
            return window.arweaveWallet.getActiveAddress();
        }
        else {
            return this.ownerToAddress(jwk.n);
        }
    }
    async ownerToAddress(owner) {
        return ArweaveUtils$2.bufferTob64Url(await this.crypto.hash(ArweaveUtils$2.b64UrlToBuffer(owner)));
    }
}
wallets.default = Wallets;

var silo = {};

Object.defineProperty(silo, "__esModule", { value: true });
silo.SiloResource = void 0;
const ArweaveUtils$1 = utils$a;
class Silo {
    constructor(api, crypto, transactions) {
        this.api = api;
        this.crypto = crypto;
        this.transactions = transactions;
    }
    async get(siloURI) {
        if (!siloURI) {
            throw new Error(`No Silo URI specified`);
        }
        const resource = await this.parseUri(siloURI);
        const ids = await this.transactions.search("Silo-Name", resource.getAccessKey());
        if (ids.length == 0) {
            throw new Error(`No data could be found for the Silo URI: ${siloURI}`);
        }
        const transaction = await this.transactions.get(ids[0]);
        if (!transaction) {
            throw new Error(`No data could be found for the Silo URI: ${siloURI}`);
        }
        const encrypted = transaction.get("data", { decode: true, string: false });
        return this.crypto.decrypt(encrypted, resource.getEncryptionKey());
    }
    async readTransactionData(transaction, siloURI) {
        if (!siloURI) {
            throw new Error(`No Silo URI specified`);
        }
        const resource = await this.parseUri(siloURI);
        const encrypted = transaction.get("data", { decode: true, string: false });
        return this.crypto.decrypt(encrypted, resource.getEncryptionKey());
    }
    async parseUri(siloURI) {
        const parsed = siloURI.match(/^([a-z0-9-_]+)\.([0-9]+)/i);
        if (!parsed) {
            throw new Error(`Invalid Silo name, must be a name in the format of [a-z0-9]+.[0-9]+, e.g. 'bubble.7'`);
        }
        const siloName = parsed[1];
        const hashIterations = Math.pow(2, parseInt(parsed[2]));
        const digest = await this.hash(ArweaveUtils$1.stringToBuffer(siloName), hashIterations);
        const accessKey = ArweaveUtils$1.bufferTob64(digest.slice(0, 15));
        const encryptionkey = await this.hash(digest.slice(16, 31), 1);
        return new SiloResource(siloURI, accessKey, encryptionkey);
    }
    async hash(input, iterations) {
        let digest = await this.crypto.hash(input);
        for (let count = 0; count < iterations - 1; count++) {
            digest = await this.crypto.hash(digest);
        }
        return digest;
    }
}
silo.default = Silo;
class SiloResource {
    constructor(uri, accessKey, encryptionKey) {
        this.uri = uri;
        this.accessKey = accessKey;
        this.encryptionKey = encryptionKey;
    }
    getUri() {
        return this.uri;
    }
    getAccessKey() {
        return this.accessKey;
    }
    getEncryptionKey() {
        return this.encryptionKey;
    }
}
silo.SiloResource = SiloResource;

var chunks = {};

Object.defineProperty(chunks, "__esModule", { value: true });
const error_1$1 = error;
const ArweaveUtils = utils$a;
class Chunks {
    constructor(api) {
        this.api = api;
    }
    async getTransactionOffset(id) {
        const resp = await this.api.get(`tx/${id}/offset`);
        if (resp.status === 200) {
            return resp.data;
        }
        throw new Error(`Unable to get transaction offset: ${(0, error_1$1.getError)(resp)}`);
    }
    async getChunk(offset) {
        const resp = await this.api.get(`chunk/${offset}`);
        if (resp.status === 200) {
            return resp.data;
        }
        throw new Error(`Unable to get chunk: ${(0, error_1$1.getError)(resp)}`);
    }
    async getChunkData(offset) {
        const chunk = await this.getChunk(offset);
        const buf = ArweaveUtils.b64UrlToBuffer(chunk.chunk);
        return buf;
    }
    firstChunkOffset(offsetResponse) {
        return parseInt(offsetResponse.offset) - parseInt(offsetResponse.size) + 1;
    }
    async downloadChunkedData(id) {
        const offsetResponse = await this.getTransactionOffset(id);
        const size = parseInt(offsetResponse.size);
        const endOffset = parseInt(offsetResponse.offset);
        const startOffset = endOffset - size + 1;
        const data = new Uint8Array(size);
        let byte = 0;
        while (byte < size) {
            if (this.api.config.logging) {
                console.log(`[chunk] ${byte}/${size}`);
            }
            let chunkData;
            try {
                chunkData = await this.getChunkData(startOffset + byte);
            }
            catch (error) {
                console.error(`[chunk] Failed to fetch chunk at offset ${startOffset + byte}`);
                console.error(`[chunk] This could indicate that the chunk wasn't uploaded or hasn't yet seeded properly to a particular gateway/node`);
            }
            if (chunkData) {
                data.set(chunkData, byte);
                byte += chunkData.length;
            }
            else {
                throw new Error(`Couldn't complete data download at ${byte}/${size}`);
            }
        }
        return data;
    }
}
chunks.default = Chunks;

var blocks = {};

Object.defineProperty(blocks, "__esModule", { value: true });
const error_1 = error;

class Blocks {
    constructor(api, network) {
        this.api = api;
        this.network = network;
    }
    /**
     * Gets a block by its "indep_hash"
     */
    async get(indepHash) {
        const response = await this.api.get(`${Blocks.ENDPOINT}${indepHash}`);
        if (response.status === 200) {
            return response.data;
        }
        else {
            if (response.status === 404) {
                throw new error_1.default("BLOCK_NOT_FOUND" /* ArweaveErrorType.BLOCK_NOT_FOUND */);
            }
            else {
                throw new Error(`Error while loading block data: ${response}`);
            }
        }
    }
    /**
     * Gets current block data (ie. block with indep_hash = Network.getInfo().current)
     */
    async getCurrent() {
        const { current } = await this.network.getInfo();
        return await this.get(current);
    }
}
blocks.default = Blocks;
Blocks.ENDPOINT = "block/hash/";

var hasRequiredCommon;

function requireCommon () {
	if (hasRequiredCommon) return common;
	hasRequiredCommon = 1;
	Object.defineProperty(common, "__esModule", { value: true });
	const ar_1 = ar;
	const api_1 = api;
	const node_driver_1 = webcryptoDriver;
	const network_1 = network;
	const transactions_1 = requireTransactions();
	const wallets_1 = wallets;
	const transaction_1 = requireTransaction();
	const ArweaveUtils = utils$a;
	const silo_1 = silo;
	const chunks_1 = chunks;
	const blocks_1 = blocks;
	class Arweave {
	    constructor(apiConfig) {
	        this.api = new api_1.default(apiConfig);
	        this.wallets = new wallets_1.default(this.api, Arweave.crypto);
	        this.chunks = new chunks_1.default(this.api);
	        this.transactions = new transactions_1.default(this.api, Arweave.crypto, this.chunks);
	        this.silo = new silo_1.default(this.api, this.crypto, this.transactions);
	        this.network = new network_1.default(this.api);
	        this.blocks = new blocks_1.default(this.api, this.network);
	        this.ar = new ar_1.default();
	    }
	    /** @deprecated */
	    get crypto() {
	        return Arweave.crypto;
	    }
	    /** @deprecated */
	    get utils() {
	        return Arweave.utils;
	    }
	    getConfig() {
	        return {
	            api: this.api.getConfig(),
	            crypto: null,
	        };
	    }
	    async createTransaction(attributes, jwk) {
	        const transaction = {};
	        Object.assign(transaction, attributes);
	        if (!attributes.data && !(attributes.target && attributes.quantity)) {
	            throw new Error(`A new Arweave transaction must have a 'data' value, or 'target' and 'quantity' values.`);
	        }
	        if (attributes.owner == undefined) {
	            if (jwk && jwk !== "use_wallet") {
	                transaction.owner = jwk.n;
	            }
	        }
	        if (attributes.last_tx == undefined) {
	            transaction.last_tx = await this.transactions.getTransactionAnchor();
	        }
	        if (typeof attributes.data === "string") {
	            attributes.data = ArweaveUtils.stringToBuffer(attributes.data);
	        }
	        if (attributes.data instanceof ArrayBuffer) {
	            attributes.data = new Uint8Array(attributes.data);
	        }
	        if (attributes.data && !(attributes.data instanceof Uint8Array)) {
	            throw new Error("Expected data to be a string, Uint8Array or ArrayBuffer");
	        }
	        if (attributes.reward == undefined) {
	            const length = attributes.data ? attributes.data.byteLength : 0;
	            transaction.reward = await this.transactions.getPrice(length, transaction.target);
	        }
	        // here we should call prepare chunk
	        transaction.data_root = "";
	        transaction.data_size = attributes.data
	            ? attributes.data.byteLength.toString()
	            : "0";
	        transaction.data = attributes.data || new Uint8Array(0);
	        const createdTransaction = new transaction_1.default(transaction);
	        await createdTransaction.getSignatureData();
	        return createdTransaction;
	    }
	    async createSiloTransaction(attributes, jwk, siloUri) {
	        const transaction = {};
	        Object.assign(transaction, attributes);
	        if (!attributes.data) {
	            throw new Error(`Silo transactions must have a 'data' value`);
	        }
	        if (!siloUri) {
	            throw new Error(`No Silo URI specified.`);
	        }
	        if (attributes.target || attributes.quantity) {
	            throw new Error(`Silo transactions can only be used for storing data, sending AR to other wallets isn't supported.`);
	        }
	        if (attributes.owner == undefined) {
	            if (!jwk || !jwk.n) {
	                throw new Error(`A new Arweave transaction must either have an 'owner' attribute, or you must provide the jwk parameter.`);
	            }
	            transaction.owner = jwk.n;
	        }
	        if (attributes.last_tx == undefined) {
	            transaction.last_tx = await this.transactions.getTransactionAnchor();
	        }
	        const siloResource = await this.silo.parseUri(siloUri);
	        if (typeof attributes.data == "string") {
	            const encrypted = await this.crypto.encrypt(ArweaveUtils.stringToBuffer(attributes.data), siloResource.getEncryptionKey());
	            transaction.reward = await this.transactions.getPrice(encrypted.byteLength);
	            transaction.data = ArweaveUtils.bufferTob64Url(encrypted);
	        }
	        if (attributes.data instanceof Uint8Array) {
	            const encrypted = await this.crypto.encrypt(attributes.data, siloResource.getEncryptionKey());
	            transaction.reward = await this.transactions.getPrice(encrypted.byteLength);
	            transaction.data = ArweaveUtils.bufferTob64Url(encrypted);
	        }
	        const siloTransaction = new transaction_1.default(transaction);
	        siloTransaction.addTag("Silo-Name", siloResource.getAccessKey());
	        siloTransaction.addTag("Silo-Version", `0.1.0`);
	        return siloTransaction;
	    }
	    arql(query) {
	        return this.api
	            .post("/arql", query)
	            .then((response) => response.data || []);
	    }
	}
	common.default = Arweave;
	Arweave.crypto = new node_driver_1.default();
	Arweave.utils = ArweaveUtils;
	
	return common;
}

var hasRequiredDeepHash;

function requireDeepHash () {
	if (hasRequiredDeepHash) return deepHash;
	hasRequiredDeepHash = 1;
	Object.defineProperty(deepHash, "__esModule", { value: true });
	const common_1 = requireCommon();
	async function deepHash$1(data) {
	    if (Array.isArray(data)) {
	        const tag = common_1.default.utils.concatBuffers([
	            common_1.default.utils.stringToBuffer("list"),
	            common_1.default.utils.stringToBuffer(data.length.toString()),
	        ]);
	        return await deepHashChunks(data, await common_1.default.crypto.hash(tag, "SHA-384"));
	    }
	    const tag = common_1.default.utils.concatBuffers([
	        common_1.default.utils.stringToBuffer("blob"),
	        common_1.default.utils.stringToBuffer(data.byteLength.toString()),
	    ]);
	    const taggedHash = common_1.default.utils.concatBuffers([
	        await common_1.default.crypto.hash(tag, "SHA-384"),
	        await common_1.default.crypto.hash(data, "SHA-384"),
	    ]);
	    return await common_1.default.crypto.hash(taggedHash, "SHA-384");
	}
	deepHash.default = deepHash$1;
	async function deepHashChunks(chunks, acc) {
	    if (chunks.length < 1) {
	        return acc;
	    }
	    const hashPair = common_1.default.utils.concatBuffers([
	        acc,
	        await deepHash$1(chunks[0]),
	    ]);
	    const newAcc = await common_1.default.crypto.hash(hashPair, "SHA-384");
	    return await deepHashChunks(chunks.slice(1), newAcc);
	}
	
	return deepHash;
}

var hasRequiredTransaction;

function requireTransaction () {
	if (hasRequiredTransaction) return transaction;
	hasRequiredTransaction = 1;
	Object.defineProperty(transaction, "__esModule", { value: true });
	transaction.Tag = void 0;
	const ArweaveUtils = utils$a;
	const deepHash_1 = requireDeepHash();
	const merkle_1 = requireMerkle();
	class BaseObject {
	    get(field, options) {
	        if (!Object.getOwnPropertyNames(this).includes(field)) {
	            throw new Error(`Field "${field}" is not a property of the Arweave Transaction class.`);
	        }
	        // Handle fields that are Uint8Arrays.
	        // To maintain compat we encode them to b64url
	        // if decode option is not specificed.
	        if (this[field] instanceof Uint8Array) {
	            if (options && options.decode && options.string) {
	                return ArweaveUtils.bufferToString(this[field]);
	            }
	            if (options && options.decode && !options.string) {
	                return this[field];
	            }
	            return ArweaveUtils.bufferTob64Url(this[field]);
	        }
	        if (options && options.decode == true) {
	            if (options && options.string) {
	                return ArweaveUtils.b64UrlToString(this[field]);
	            }
	            return ArweaveUtils.b64UrlToBuffer(this[field]);
	        }
	        return this[field];
	    }
	}
	class Tag extends BaseObject {
	    constructor(name, value, decode = false) {
	        super();
	        this.name = name;
	        this.value = value;
	    }
	}
	transaction.Tag = Tag;
	class Transaction extends BaseObject {
	    constructor(attributes = {}) {
	        super();
	        this.format = 2;
	        this.id = "";
	        this.last_tx = "";
	        this.owner = "";
	        this.tags = [];
	        this.target = "";
	        this.quantity = "0";
	        this.data_size = "0";
	        this.data = new Uint8Array();
	        this.data_root = "";
	        this.reward = "0";
	        this.signature = "";
	        Object.assign(this, attributes);
	        // If something passes in a Tx that has been toJSON'ed and back,
	        // or where the data was filled in from /tx/data endpoint.
	        // data will be b64url encoded, so decode it.
	        if (typeof this.data === "string") {
	            this.data = ArweaveUtils.b64UrlToBuffer(this.data);
	        }
	        if (attributes.tags) {
	            this.tags = attributes.tags.map((tag) => {
	                return new Tag(tag.name, tag.value);
	            });
	        }
	    }
	    addTag(name, value) {
	        this.tags.push(new Tag(ArweaveUtils.stringToB64Url(name), ArweaveUtils.stringToB64Url(value)));
	    }
	    toJSON() {
	        return {
	            format: this.format,
	            id: this.id,
	            last_tx: this.last_tx,
	            owner: this.owner,
	            tags: this.tags,
	            target: this.target,
	            quantity: this.quantity,
	            data: ArweaveUtils.bufferTob64Url(this.data),
	            data_size: this.data_size,
	            data_root: this.data_root,
	            data_tree: this.data_tree,
	            reward: this.reward,
	            signature: this.signature,
	        };
	    }
	    setOwner(owner) {
	        this.owner = owner;
	    }
	    setSignature({ id, owner, reward, tags, signature, }) {
	        this.id = id;
	        this.owner = owner;
	        if (reward)
	            this.reward = reward;
	        if (tags)
	            this.tags = tags;
	        this.signature = signature;
	    }
	    async prepareChunks(data) {
	        // Note: we *do not* use `this.data`, the caller may be
	        // operating on a transaction with an zero length data field.
	        // This function computes the chunks for the data passed in and
	        // assigns the result to this transaction. It should not read the
	        // data *from* this transaction.
	        if (!this.chunks && data.byteLength > 0) {
	            this.chunks = await (0, merkle_1.generateTransactionChunks)(data);
	            this.data_root = ArweaveUtils.bufferTob64Url(this.chunks.data_root);
	        }
	        if (!this.chunks && data.byteLength === 0) {
	            this.chunks = {
	                chunks: [],
	                data_root: new Uint8Array(),
	                proofs: [],
	            };
	            this.data_root = "";
	        }
	    }
	    // Returns a chunk in a format suitable for posting to /chunk.
	    // Similar to `prepareChunks()` this does not operate `this.data`,
	    // instead using the data passed in.
	    getChunk(idx, data) {
	        if (!this.chunks) {
	            throw new Error(`Chunks have not been prepared`);
	        }
	        const proof = this.chunks.proofs[idx];
	        const chunk = this.chunks.chunks[idx];
	        return {
	            data_root: this.data_root,
	            data_size: this.data_size,
	            data_path: ArweaveUtils.bufferTob64Url(proof.proof),
	            offset: proof.offset.toString(),
	            chunk: ArweaveUtils.bufferTob64Url(data.slice(chunk.minByteRange, chunk.maxByteRange)),
	        };
	    }
	    async getSignatureData() {
	        switch (this.format) {
	            case 1:
	                let tags = this.tags.reduce((accumulator, tag) => {
	                    return ArweaveUtils.concatBuffers([
	                        accumulator,
	                        tag.get("name", { decode: true, string: false }),
	                        tag.get("value", { decode: true, string: false }),
	                    ]);
	                }, new Uint8Array());
	                return ArweaveUtils.concatBuffers([
	                    this.get("owner", { decode: true, string: false }),
	                    this.get("target", { decode: true, string: false }),
	                    this.get("data", { decode: true, string: false }),
	                    ArweaveUtils.stringToBuffer(this.quantity),
	                    ArweaveUtils.stringToBuffer(this.reward),
	                    this.get("last_tx", { decode: true, string: false }),
	                    tags,
	                ]);
	            case 2:
	                if (!this.data_root) {
	                    await this.prepareChunks(this.data);
	                }
	                const tagList = this.tags.map((tag) => [
	                    tag.get("name", { decode: true, string: false }),
	                    tag.get("value", { decode: true, string: false }),
	                ]);
	                return await (0, deepHash_1.default)([
	                    ArweaveUtils.stringToBuffer(this.format.toString()),
	                    this.get("owner", { decode: true, string: false }),
	                    this.get("target", { decode: true, string: false }),
	                    ArweaveUtils.stringToBuffer(this.quantity),
	                    ArweaveUtils.stringToBuffer(this.reward),
	                    this.get("last_tx", { decode: true, string: false }),
	                    tagList,
	                    ArweaveUtils.stringToBuffer(this.data_size),
	                    this.get("data_root", { decode: true, string: false }),
	                ]);
	            default:
	                throw new Error(`Unexpected transaction format: ${this.format}`);
	        }
	    }
	}
	transaction.default = Transaction;
	
	return transaction;
}

var transactionExports = requireTransaction();

var _Reflect = {};

/*! *****************************************************************************
Copyright (C) Microsoft. All rights reserved.
Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0

THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
MERCHANTABLITY OR NON-INFRINGEMENT.

See the Apache Version 2.0 License for specific language governing permissions
and limitations under the License.
***************************************************************************** */

var hasRequired_Reflect;

function require_Reflect () {
	if (hasRequired_Reflect) return _Reflect;
	hasRequired_Reflect = 1;
	var Reflect;
	(function (Reflect) {
	    // Metadata Proposal
	    // https://rbuckton.github.io/reflect-metadata/
	    (function (factory) {
	        var root = typeof commonjsGlobal === "object" ? commonjsGlobal :
	            typeof self === "object" ? self :
	                typeof this === "object" ? this :
	                    Function("return this;")();
	        var exporter = makeExporter(Reflect);
	        if (typeof root.Reflect === "undefined") {
	            root.Reflect = Reflect;
	        }
	        else {
	            exporter = makeExporter(root.Reflect, exporter);
	        }
	        factory(exporter);
	        function makeExporter(target, previous) {
	            return function (key, value) {
	                if (typeof target[key] !== "function") {
	                    Object.defineProperty(target, key, { configurable: true, writable: true, value: value });
	                }
	                if (previous)
	                    previous(key, value);
	            };
	        }
	    })(function (exporter) {
	        var hasOwn = Object.prototype.hasOwnProperty;
	        // feature test for Symbol support
	        var supportsSymbol = typeof Symbol === "function";
	        var toPrimitiveSymbol = supportsSymbol && typeof Symbol.toPrimitive !== "undefined" ? Symbol.toPrimitive : "@@toPrimitive";
	        var iteratorSymbol = supportsSymbol && typeof Symbol.iterator !== "undefined" ? Symbol.iterator : "@@iterator";
	        var supportsCreate = typeof Object.create === "function"; // feature test for Object.create support
	        var supportsProto = { __proto__: [] } instanceof Array; // feature test for __proto__ support
	        var downLevel = !supportsCreate && !supportsProto;
	        var HashMap = {
	            // create an object in dictionary mode (a.k.a. "slow" mode in v8)
	            create: supportsCreate
	                ? function () { return MakeDictionary(Object.create(null)); }
	                : supportsProto
	                    ? function () { return MakeDictionary({ __proto__: null }); }
	                    : function () { return MakeDictionary({}); },
	            has: downLevel
	                ? function (map, key) { return hasOwn.call(map, key); }
	                : function (map, key) { return key in map; },
	            get: downLevel
	                ? function (map, key) { return hasOwn.call(map, key) ? map[key] : undefined; }
	                : function (map, key) { return map[key]; },
	        };
	        // Load global or shim versions of Map, Set, and WeakMap
	        var functionPrototype = Object.getPrototypeOf(Function);
	        var usePolyfill = typeof process === "object" && process.env && process.env["REFLECT_METADATA_USE_MAP_POLYFILL"] === "true";
	        var _Map = !usePolyfill && typeof Map === "function" && typeof Map.prototype.entries === "function" ? Map : CreateMapPolyfill();
	        var _Set = !usePolyfill && typeof Set === "function" && typeof Set.prototype.entries === "function" ? Set : CreateSetPolyfill();
	        var _WeakMap = !usePolyfill && typeof WeakMap === "function" ? WeakMap : CreateWeakMapPolyfill();
	        // [[Metadata]] internal slot
	        // https://rbuckton.github.io/reflect-metadata/#ordinary-object-internal-methods-and-internal-slots
	        var Metadata = new _WeakMap();
	        /**
	         * Applies a set of decorators to a property of a target object.
	         * @param decorators An array of decorators.
	         * @param target The target object.
	         * @param propertyKey (Optional) The property key to decorate.
	         * @param attributes (Optional) The property descriptor for the target key.
	         * @remarks Decorators are applied in reverse order.
	         * @example
	         *
	         *     class Example {
	         *         // property declarations are not part of ES6, though they are valid in TypeScript:
	         *         // static staticProperty;
	         *         // property;
	         *
	         *         constructor(p) { }
	         *         static staticMethod(p) { }
	         *         method(p) { }
	         *     }
	         *
	         *     // constructor
	         *     Example = Reflect.decorate(decoratorsArray, Example);
	         *
	         *     // property (on constructor)
	         *     Reflect.decorate(decoratorsArray, Example, "staticProperty");
	         *
	         *     // property (on prototype)
	         *     Reflect.decorate(decoratorsArray, Example.prototype, "property");
	         *
	         *     // method (on constructor)
	         *     Object.defineProperty(Example, "staticMethod",
	         *         Reflect.decorate(decoratorsArray, Example, "staticMethod",
	         *             Object.getOwnPropertyDescriptor(Example, "staticMethod")));
	         *
	         *     // method (on prototype)
	         *     Object.defineProperty(Example.prototype, "method",
	         *         Reflect.decorate(decoratorsArray, Example.prototype, "method",
	         *             Object.getOwnPropertyDescriptor(Example.prototype, "method")));
	         *
	         */
	        function decorate(decorators, target, propertyKey, attributes) {
	            if (!IsUndefined(propertyKey)) {
	                if (!IsArray(decorators))
	                    throw new TypeError();
	                if (!IsObject(target))
	                    throw new TypeError();
	                if (!IsObject(attributes) && !IsUndefined(attributes) && !IsNull(attributes))
	                    throw new TypeError();
	                if (IsNull(attributes))
	                    attributes = undefined;
	                propertyKey = ToPropertyKey(propertyKey);
	                return DecorateProperty(decorators, target, propertyKey, attributes);
	            }
	            else {
	                if (!IsArray(decorators))
	                    throw new TypeError();
	                if (!IsConstructor(target))
	                    throw new TypeError();
	                return DecorateConstructor(decorators, target);
	            }
	        }
	        exporter("decorate", decorate);
	        // 4.1.2 Reflect.metadata(metadataKey, metadataValue)
	        // https://rbuckton.github.io/reflect-metadata/#reflect.metadata
	        /**
	         * A default metadata decorator factory that can be used on a class, class member, or parameter.
	         * @param metadataKey The key for the metadata entry.
	         * @param metadataValue The value for the metadata entry.
	         * @returns A decorator function.
	         * @remarks
	         * If `metadataKey` is already defined for the target and target key, the
	         * metadataValue for that key will be overwritten.
	         * @example
	         *
	         *     // constructor
	         *     @Reflect.metadata(key, value)
	         *     class Example {
	         *     }
	         *
	         *     // property (on constructor, TypeScript only)
	         *     class Example {
	         *         @Reflect.metadata(key, value)
	         *         static staticProperty;
	         *     }
	         *
	         *     // property (on prototype, TypeScript only)
	         *     class Example {
	         *         @Reflect.metadata(key, value)
	         *         property;
	         *     }
	         *
	         *     // method (on constructor)
	         *     class Example {
	         *         @Reflect.metadata(key, value)
	         *         static staticMethod() { }
	         *     }
	         *
	         *     // method (on prototype)
	         *     class Example {
	         *         @Reflect.metadata(key, value)
	         *         method() { }
	         *     }
	         *
	         */
	        function metadata(metadataKey, metadataValue) {
	            function decorator(target, propertyKey) {
	                if (!IsObject(target))
	                    throw new TypeError();
	                if (!IsUndefined(propertyKey) && !IsPropertyKey(propertyKey))
	                    throw new TypeError();
	                OrdinaryDefineOwnMetadata(metadataKey, metadataValue, target, propertyKey);
	            }
	            return decorator;
	        }
	        exporter("metadata", metadata);
	        /**
	         * Define a unique metadata entry on the target.
	         * @param metadataKey A key used to store and retrieve metadata.
	         * @param metadataValue A value that contains attached metadata.
	         * @param target The target object on which to define metadata.
	         * @param propertyKey (Optional) The property key for the target.
	         * @example
	         *
	         *     class Example {
	         *         // property declarations are not part of ES6, though they are valid in TypeScript:
	         *         // static staticProperty;
	         *         // property;
	         *
	         *         constructor(p) { }
	         *         static staticMethod(p) { }
	         *         method(p) { }
	         *     }
	         *
	         *     // constructor
	         *     Reflect.defineMetadata("custom:annotation", options, Example);
	         *
	         *     // property (on constructor)
	         *     Reflect.defineMetadata("custom:annotation", options, Example, "staticProperty");
	         *
	         *     // property (on prototype)
	         *     Reflect.defineMetadata("custom:annotation", options, Example.prototype, "property");
	         *
	         *     // method (on constructor)
	         *     Reflect.defineMetadata("custom:annotation", options, Example, "staticMethod");
	         *
	         *     // method (on prototype)
	         *     Reflect.defineMetadata("custom:annotation", options, Example.prototype, "method");
	         *
	         *     // decorator factory as metadata-producing annotation.
	         *     function MyAnnotation(options): Decorator {
	         *         return (target, key?) => Reflect.defineMetadata("custom:annotation", options, target, key);
	         *     }
	         *
	         */
	        function defineMetadata(metadataKey, metadataValue, target, propertyKey) {
	            if (!IsObject(target))
	                throw new TypeError();
	            if (!IsUndefined(propertyKey))
	                propertyKey = ToPropertyKey(propertyKey);
	            return OrdinaryDefineOwnMetadata(metadataKey, metadataValue, target, propertyKey);
	        }
	        exporter("defineMetadata", defineMetadata);
	        /**
	         * Gets a value indicating whether the target object or its prototype chain has the provided metadata key defined.
	         * @param metadataKey A key used to store and retrieve metadata.
	         * @param target The target object on which the metadata is defined.
	         * @param propertyKey (Optional) The property key for the target.
	         * @returns `true` if the metadata key was defined on the target object or its prototype chain; otherwise, `false`.
	         * @example
	         *
	         *     class Example {
	         *         // property declarations are not part of ES6, though they are valid in TypeScript:
	         *         // static staticProperty;
	         *         // property;
	         *
	         *         constructor(p) { }
	         *         static staticMethod(p) { }
	         *         method(p) { }
	         *     }
	         *
	         *     // constructor
	         *     result = Reflect.hasMetadata("custom:annotation", Example);
	         *
	         *     // property (on constructor)
	         *     result = Reflect.hasMetadata("custom:annotation", Example, "staticProperty");
	         *
	         *     // property (on prototype)
	         *     result = Reflect.hasMetadata("custom:annotation", Example.prototype, "property");
	         *
	         *     // method (on constructor)
	         *     result = Reflect.hasMetadata("custom:annotation", Example, "staticMethod");
	         *
	         *     // method (on prototype)
	         *     result = Reflect.hasMetadata("custom:annotation", Example.prototype, "method");
	         *
	         */
	        function hasMetadata(metadataKey, target, propertyKey) {
	            if (!IsObject(target))
	                throw new TypeError();
	            if (!IsUndefined(propertyKey))
	                propertyKey = ToPropertyKey(propertyKey);
	            return OrdinaryHasMetadata(metadataKey, target, propertyKey);
	        }
	        exporter("hasMetadata", hasMetadata);
	        /**
	         * Gets a value indicating whether the target object has the provided metadata key defined.
	         * @param metadataKey A key used to store and retrieve metadata.
	         * @param target The target object on which the metadata is defined.
	         * @param propertyKey (Optional) The property key for the target.
	         * @returns `true` if the metadata key was defined on the target object; otherwise, `false`.
	         * @example
	         *
	         *     class Example {
	         *         // property declarations are not part of ES6, though they are valid in TypeScript:
	         *         // static staticProperty;
	         *         // property;
	         *
	         *         constructor(p) { }
	         *         static staticMethod(p) { }
	         *         method(p) { }
	         *     }
	         *
	         *     // constructor
	         *     result = Reflect.hasOwnMetadata("custom:annotation", Example);
	         *
	         *     // property (on constructor)
	         *     result = Reflect.hasOwnMetadata("custom:annotation", Example, "staticProperty");
	         *
	         *     // property (on prototype)
	         *     result = Reflect.hasOwnMetadata("custom:annotation", Example.prototype, "property");
	         *
	         *     // method (on constructor)
	         *     result = Reflect.hasOwnMetadata("custom:annotation", Example, "staticMethod");
	         *
	         *     // method (on prototype)
	         *     result = Reflect.hasOwnMetadata("custom:annotation", Example.prototype, "method");
	         *
	         */
	        function hasOwnMetadata(metadataKey, target, propertyKey) {
	            if (!IsObject(target))
	                throw new TypeError();
	            if (!IsUndefined(propertyKey))
	                propertyKey = ToPropertyKey(propertyKey);
	            return OrdinaryHasOwnMetadata(metadataKey, target, propertyKey);
	        }
	        exporter("hasOwnMetadata", hasOwnMetadata);
	        /**
	         * Gets the metadata value for the provided metadata key on the target object or its prototype chain.
	         * @param metadataKey A key used to store and retrieve metadata.
	         * @param target The target object on which the metadata is defined.
	         * @param propertyKey (Optional) The property key for the target.
	         * @returns The metadata value for the metadata key if found; otherwise, `undefined`.
	         * @example
	         *
	         *     class Example {
	         *         // property declarations are not part of ES6, though they are valid in TypeScript:
	         *         // static staticProperty;
	         *         // property;
	         *
	         *         constructor(p) { }
	         *         static staticMethod(p) { }
	         *         method(p) { }
	         *     }
	         *
	         *     // constructor
	         *     result = Reflect.getMetadata("custom:annotation", Example);
	         *
	         *     // property (on constructor)
	         *     result = Reflect.getMetadata("custom:annotation", Example, "staticProperty");
	         *
	         *     // property (on prototype)
	         *     result = Reflect.getMetadata("custom:annotation", Example.prototype, "property");
	         *
	         *     // method (on constructor)
	         *     result = Reflect.getMetadata("custom:annotation", Example, "staticMethod");
	         *
	         *     // method (on prototype)
	         *     result = Reflect.getMetadata("custom:annotation", Example.prototype, "method");
	         *
	         */
	        function getMetadata(metadataKey, target, propertyKey) {
	            if (!IsObject(target))
	                throw new TypeError();
	            if (!IsUndefined(propertyKey))
	                propertyKey = ToPropertyKey(propertyKey);
	            return OrdinaryGetMetadata(metadataKey, target, propertyKey);
	        }
	        exporter("getMetadata", getMetadata);
	        /**
	         * Gets the metadata value for the provided metadata key on the target object.
	         * @param metadataKey A key used to store and retrieve metadata.
	         * @param target The target object on which the metadata is defined.
	         * @param propertyKey (Optional) The property key for the target.
	         * @returns The metadata value for the metadata key if found; otherwise, `undefined`.
	         * @example
	         *
	         *     class Example {
	         *         // property declarations are not part of ES6, though they are valid in TypeScript:
	         *         // static staticProperty;
	         *         // property;
	         *
	         *         constructor(p) { }
	         *         static staticMethod(p) { }
	         *         method(p) { }
	         *     }
	         *
	         *     // constructor
	         *     result = Reflect.getOwnMetadata("custom:annotation", Example);
	         *
	         *     // property (on constructor)
	         *     result = Reflect.getOwnMetadata("custom:annotation", Example, "staticProperty");
	         *
	         *     // property (on prototype)
	         *     result = Reflect.getOwnMetadata("custom:annotation", Example.prototype, "property");
	         *
	         *     // method (on constructor)
	         *     result = Reflect.getOwnMetadata("custom:annotation", Example, "staticMethod");
	         *
	         *     // method (on prototype)
	         *     result = Reflect.getOwnMetadata("custom:annotation", Example.prototype, "method");
	         *
	         */
	        function getOwnMetadata(metadataKey, target, propertyKey) {
	            if (!IsObject(target))
	                throw new TypeError();
	            if (!IsUndefined(propertyKey))
	                propertyKey = ToPropertyKey(propertyKey);
	            return OrdinaryGetOwnMetadata(metadataKey, target, propertyKey);
	        }
	        exporter("getOwnMetadata", getOwnMetadata);
	        /**
	         * Gets the metadata keys defined on the target object or its prototype chain.
	         * @param target The target object on which the metadata is defined.
	         * @param propertyKey (Optional) The property key for the target.
	         * @returns An array of unique metadata keys.
	         * @example
	         *
	         *     class Example {
	         *         // property declarations are not part of ES6, though they are valid in TypeScript:
	         *         // static staticProperty;
	         *         // property;
	         *
	         *         constructor(p) { }
	         *         static staticMethod(p) { }
	         *         method(p) { }
	         *     }
	         *
	         *     // constructor
	         *     result = Reflect.getMetadataKeys(Example);
	         *
	         *     // property (on constructor)
	         *     result = Reflect.getMetadataKeys(Example, "staticProperty");
	         *
	         *     // property (on prototype)
	         *     result = Reflect.getMetadataKeys(Example.prototype, "property");
	         *
	         *     // method (on constructor)
	         *     result = Reflect.getMetadataKeys(Example, "staticMethod");
	         *
	         *     // method (on prototype)
	         *     result = Reflect.getMetadataKeys(Example.prototype, "method");
	         *
	         */
	        function getMetadataKeys(target, propertyKey) {
	            if (!IsObject(target))
	                throw new TypeError();
	            if (!IsUndefined(propertyKey))
	                propertyKey = ToPropertyKey(propertyKey);
	            return OrdinaryMetadataKeys(target, propertyKey);
	        }
	        exporter("getMetadataKeys", getMetadataKeys);
	        /**
	         * Gets the unique metadata keys defined on the target object.
	         * @param target The target object on which the metadata is defined.
	         * @param propertyKey (Optional) The property key for the target.
	         * @returns An array of unique metadata keys.
	         * @example
	         *
	         *     class Example {
	         *         // property declarations are not part of ES6, though they are valid in TypeScript:
	         *         // static staticProperty;
	         *         // property;
	         *
	         *         constructor(p) { }
	         *         static staticMethod(p) { }
	         *         method(p) { }
	         *     }
	         *
	         *     // constructor
	         *     result = Reflect.getOwnMetadataKeys(Example);
	         *
	         *     // property (on constructor)
	         *     result = Reflect.getOwnMetadataKeys(Example, "staticProperty");
	         *
	         *     // property (on prototype)
	         *     result = Reflect.getOwnMetadataKeys(Example.prototype, "property");
	         *
	         *     // method (on constructor)
	         *     result = Reflect.getOwnMetadataKeys(Example, "staticMethod");
	         *
	         *     // method (on prototype)
	         *     result = Reflect.getOwnMetadataKeys(Example.prototype, "method");
	         *
	         */
	        function getOwnMetadataKeys(target, propertyKey) {
	            if (!IsObject(target))
	                throw new TypeError();
	            if (!IsUndefined(propertyKey))
	                propertyKey = ToPropertyKey(propertyKey);
	            return OrdinaryOwnMetadataKeys(target, propertyKey);
	        }
	        exporter("getOwnMetadataKeys", getOwnMetadataKeys);
	        /**
	         * Deletes the metadata entry from the target object with the provided key.
	         * @param metadataKey A key used to store and retrieve metadata.
	         * @param target The target object on which the metadata is defined.
	         * @param propertyKey (Optional) The property key for the target.
	         * @returns `true` if the metadata entry was found and deleted; otherwise, false.
	         * @example
	         *
	         *     class Example {
	         *         // property declarations are not part of ES6, though they are valid in TypeScript:
	         *         // static staticProperty;
	         *         // property;
	         *
	         *         constructor(p) { }
	         *         static staticMethod(p) { }
	         *         method(p) { }
	         *     }
	         *
	         *     // constructor
	         *     result = Reflect.deleteMetadata("custom:annotation", Example);
	         *
	         *     // property (on constructor)
	         *     result = Reflect.deleteMetadata("custom:annotation", Example, "staticProperty");
	         *
	         *     // property (on prototype)
	         *     result = Reflect.deleteMetadata("custom:annotation", Example.prototype, "property");
	         *
	         *     // method (on constructor)
	         *     result = Reflect.deleteMetadata("custom:annotation", Example, "staticMethod");
	         *
	         *     // method (on prototype)
	         *     result = Reflect.deleteMetadata("custom:annotation", Example.prototype, "method");
	         *
	         */
	        function deleteMetadata(metadataKey, target, propertyKey) {
	            if (!IsObject(target))
	                throw new TypeError();
	            if (!IsUndefined(propertyKey))
	                propertyKey = ToPropertyKey(propertyKey);
	            var metadataMap = GetOrCreateMetadataMap(target, propertyKey, /*Create*/ false);
	            if (IsUndefined(metadataMap))
	                return false;
	            if (!metadataMap.delete(metadataKey))
	                return false;
	            if (metadataMap.size > 0)
	                return true;
	            var targetMetadata = Metadata.get(target);
	            targetMetadata.delete(propertyKey);
	            if (targetMetadata.size > 0)
	                return true;
	            Metadata.delete(target);
	            return true;
	        }
	        exporter("deleteMetadata", deleteMetadata);
	        function DecorateConstructor(decorators, target) {
	            for (var i = decorators.length - 1; i >= 0; --i) {
	                var decorator = decorators[i];
	                var decorated = decorator(target);
	                if (!IsUndefined(decorated) && !IsNull(decorated)) {
	                    if (!IsConstructor(decorated))
	                        throw new TypeError();
	                    target = decorated;
	                }
	            }
	            return target;
	        }
	        function DecorateProperty(decorators, target, propertyKey, descriptor) {
	            for (var i = decorators.length - 1; i >= 0; --i) {
	                var decorator = decorators[i];
	                var decorated = decorator(target, propertyKey, descriptor);
	                if (!IsUndefined(decorated) && !IsNull(decorated)) {
	                    if (!IsObject(decorated))
	                        throw new TypeError();
	                    descriptor = decorated;
	                }
	            }
	            return descriptor;
	        }
	        function GetOrCreateMetadataMap(O, P, Create) {
	            var targetMetadata = Metadata.get(O);
	            if (IsUndefined(targetMetadata)) {
	                if (!Create)
	                    return undefined;
	                targetMetadata = new _Map();
	                Metadata.set(O, targetMetadata);
	            }
	            var metadataMap = targetMetadata.get(P);
	            if (IsUndefined(metadataMap)) {
	                if (!Create)
	                    return undefined;
	                metadataMap = new _Map();
	                targetMetadata.set(P, metadataMap);
	            }
	            return metadataMap;
	        }
	        // 3.1.1.1 OrdinaryHasMetadata(MetadataKey, O, P)
	        // https://rbuckton.github.io/reflect-metadata/#ordinaryhasmetadata
	        function OrdinaryHasMetadata(MetadataKey, O, P) {
	            var hasOwn = OrdinaryHasOwnMetadata(MetadataKey, O, P);
	            if (hasOwn)
	                return true;
	            var parent = OrdinaryGetPrototypeOf(O);
	            if (!IsNull(parent))
	                return OrdinaryHasMetadata(MetadataKey, parent, P);
	            return false;
	        }
	        // 3.1.2.1 OrdinaryHasOwnMetadata(MetadataKey, O, P)
	        // https://rbuckton.github.io/reflect-metadata/#ordinaryhasownmetadata
	        function OrdinaryHasOwnMetadata(MetadataKey, O, P) {
	            var metadataMap = GetOrCreateMetadataMap(O, P, /*Create*/ false);
	            if (IsUndefined(metadataMap))
	                return false;
	            return ToBoolean(metadataMap.has(MetadataKey));
	        }
	        // 3.1.3.1 OrdinaryGetMetadata(MetadataKey, O, P)
	        // https://rbuckton.github.io/reflect-metadata/#ordinarygetmetadata
	        function OrdinaryGetMetadata(MetadataKey, O, P) {
	            var hasOwn = OrdinaryHasOwnMetadata(MetadataKey, O, P);
	            if (hasOwn)
	                return OrdinaryGetOwnMetadata(MetadataKey, O, P);
	            var parent = OrdinaryGetPrototypeOf(O);
	            if (!IsNull(parent))
	                return OrdinaryGetMetadata(MetadataKey, parent, P);
	            return undefined;
	        }
	        // 3.1.4.1 OrdinaryGetOwnMetadata(MetadataKey, O, P)
	        // https://rbuckton.github.io/reflect-metadata/#ordinarygetownmetadata
	        function OrdinaryGetOwnMetadata(MetadataKey, O, P) {
	            var metadataMap = GetOrCreateMetadataMap(O, P, /*Create*/ false);
	            if (IsUndefined(metadataMap))
	                return undefined;
	            return metadataMap.get(MetadataKey);
	        }
	        // 3.1.5.1 OrdinaryDefineOwnMetadata(MetadataKey, MetadataValue, O, P)
	        // https://rbuckton.github.io/reflect-metadata/#ordinarydefineownmetadata
	        function OrdinaryDefineOwnMetadata(MetadataKey, MetadataValue, O, P) {
	            var metadataMap = GetOrCreateMetadataMap(O, P, /*Create*/ true);
	            metadataMap.set(MetadataKey, MetadataValue);
	        }
	        // 3.1.6.1 OrdinaryMetadataKeys(O, P)
	        // https://rbuckton.github.io/reflect-metadata/#ordinarymetadatakeys
	        function OrdinaryMetadataKeys(O, P) {
	            var ownKeys = OrdinaryOwnMetadataKeys(O, P);
	            var parent = OrdinaryGetPrototypeOf(O);
	            if (parent === null)
	                return ownKeys;
	            var parentKeys = OrdinaryMetadataKeys(parent, P);
	            if (parentKeys.length <= 0)
	                return ownKeys;
	            if (ownKeys.length <= 0)
	                return parentKeys;
	            var set = new _Set();
	            var keys = [];
	            for (var _i = 0, ownKeys_1 = ownKeys; _i < ownKeys_1.length; _i++) {
	                var key = ownKeys_1[_i];
	                var hasKey = set.has(key);
	                if (!hasKey) {
	                    set.add(key);
	                    keys.push(key);
	                }
	            }
	            for (var _a = 0, parentKeys_1 = parentKeys; _a < parentKeys_1.length; _a++) {
	                var key = parentKeys_1[_a];
	                var hasKey = set.has(key);
	                if (!hasKey) {
	                    set.add(key);
	                    keys.push(key);
	                }
	            }
	            return keys;
	        }
	        // 3.1.7.1 OrdinaryOwnMetadataKeys(O, P)
	        // https://rbuckton.github.io/reflect-metadata/#ordinaryownmetadatakeys
	        function OrdinaryOwnMetadataKeys(O, P) {
	            var keys = [];
	            var metadataMap = GetOrCreateMetadataMap(O, P, /*Create*/ false);
	            if (IsUndefined(metadataMap))
	                return keys;
	            var keysObj = metadataMap.keys();
	            var iterator = GetIterator(keysObj);
	            var k = 0;
	            while (true) {
	                var next = IteratorStep(iterator);
	                if (!next) {
	                    keys.length = k;
	                    return keys;
	                }
	                var nextValue = IteratorValue(next);
	                try {
	                    keys[k] = nextValue;
	                }
	                catch (e) {
	                    try {
	                        IteratorClose(iterator);
	                    }
	                    finally {
	                        throw e;
	                    }
	                }
	                k++;
	            }
	        }
	        // 6 ECMAScript Data Typ0es and Values
	        // https://tc39.github.io/ecma262/#sec-ecmascript-data-types-and-values
	        function Type(x) {
	            if (x === null)
	                return 1 /* Null */;
	            switch (typeof x) {
	                case "undefined": return 0 /* Undefined */;
	                case "boolean": return 2 /* Boolean */;
	                case "string": return 3 /* String */;
	                case "symbol": return 4 /* Symbol */;
	                case "number": return 5 /* Number */;
	                case "object": return x === null ? 1 /* Null */ : 6 /* Object */;
	                default: return 6 /* Object */;
	            }
	        }
	        // 6.1.1 The Undefined Type
	        // https://tc39.github.io/ecma262/#sec-ecmascript-language-types-undefined-type
	        function IsUndefined(x) {
	            return x === undefined;
	        }
	        // 6.1.2 The Null Type
	        // https://tc39.github.io/ecma262/#sec-ecmascript-language-types-null-type
	        function IsNull(x) {
	            return x === null;
	        }
	        // 6.1.5 The Symbol Type
	        // https://tc39.github.io/ecma262/#sec-ecmascript-language-types-symbol-type
	        function IsSymbol(x) {
	            return typeof x === "symbol";
	        }
	        // 6.1.7 The Object Type
	        // https://tc39.github.io/ecma262/#sec-object-type
	        function IsObject(x) {
	            return typeof x === "object" ? x !== null : typeof x === "function";
	        }
	        // 7.1 Type Conversion
	        // https://tc39.github.io/ecma262/#sec-type-conversion
	        // 7.1.1 ToPrimitive(input [, PreferredType])
	        // https://tc39.github.io/ecma262/#sec-toprimitive
	        function ToPrimitive(input, PreferredType) {
	            switch (Type(input)) {
	                case 0 /* Undefined */: return input;
	                case 1 /* Null */: return input;
	                case 2 /* Boolean */: return input;
	                case 3 /* String */: return input;
	                case 4 /* Symbol */: return input;
	                case 5 /* Number */: return input;
	            }
	            var hint = PreferredType === 3 /* String */ ? "string" : PreferredType === 5 /* Number */ ? "number" : "default";
	            var exoticToPrim = GetMethod(input, toPrimitiveSymbol);
	            if (exoticToPrim !== undefined) {
	                var result = exoticToPrim.call(input, hint);
	                if (IsObject(result))
	                    throw new TypeError();
	                return result;
	            }
	            return OrdinaryToPrimitive(input, hint === "default" ? "number" : hint);
	        }
	        // 7.1.1.1 OrdinaryToPrimitive(O, hint)
	        // https://tc39.github.io/ecma262/#sec-ordinarytoprimitive
	        function OrdinaryToPrimitive(O, hint) {
	            if (hint === "string") {
	                var toString_1 = O.toString;
	                if (IsCallable(toString_1)) {
	                    var result = toString_1.call(O);
	                    if (!IsObject(result))
	                        return result;
	                }
	                var valueOf = O.valueOf;
	                if (IsCallable(valueOf)) {
	                    var result = valueOf.call(O);
	                    if (!IsObject(result))
	                        return result;
	                }
	            }
	            else {
	                var valueOf = O.valueOf;
	                if (IsCallable(valueOf)) {
	                    var result = valueOf.call(O);
	                    if (!IsObject(result))
	                        return result;
	                }
	                var toString_2 = O.toString;
	                if (IsCallable(toString_2)) {
	                    var result = toString_2.call(O);
	                    if (!IsObject(result))
	                        return result;
	                }
	            }
	            throw new TypeError();
	        }
	        // 7.1.2 ToBoolean(argument)
	        // https://tc39.github.io/ecma262/2016/#sec-toboolean
	        function ToBoolean(argument) {
	            return !!argument;
	        }
	        // 7.1.12 ToString(argument)
	        // https://tc39.github.io/ecma262/#sec-tostring
	        function ToString(argument) {
	            return "" + argument;
	        }
	        // 7.1.14 ToPropertyKey(argument)
	        // https://tc39.github.io/ecma262/#sec-topropertykey
	        function ToPropertyKey(argument) {
	            var key = ToPrimitive(argument, 3 /* String */);
	            if (IsSymbol(key))
	                return key;
	            return ToString(key);
	        }
	        // 7.2 Testing and Comparison Operations
	        // https://tc39.github.io/ecma262/#sec-testing-and-comparison-operations
	        // 7.2.2 IsArray(argument)
	        // https://tc39.github.io/ecma262/#sec-isarray
	        function IsArray(argument) {
	            return Array.isArray
	                ? Array.isArray(argument)
	                : argument instanceof Object
	                    ? argument instanceof Array
	                    : Object.prototype.toString.call(argument) === "[object Array]";
	        }
	        // 7.2.3 IsCallable(argument)
	        // https://tc39.github.io/ecma262/#sec-iscallable
	        function IsCallable(argument) {
	            // NOTE: This is an approximation as we cannot check for [[Call]] internal method.
	            return typeof argument === "function";
	        }
	        // 7.2.4 IsConstructor(argument)
	        // https://tc39.github.io/ecma262/#sec-isconstructor
	        function IsConstructor(argument) {
	            // NOTE: This is an approximation as we cannot check for [[Construct]] internal method.
	            return typeof argument === "function";
	        }
	        // 7.2.7 IsPropertyKey(argument)
	        // https://tc39.github.io/ecma262/#sec-ispropertykey
	        function IsPropertyKey(argument) {
	            switch (Type(argument)) {
	                case 3 /* String */: return true;
	                case 4 /* Symbol */: return true;
	                default: return false;
	            }
	        }
	        // 7.3 Operations on Objects
	        // https://tc39.github.io/ecma262/#sec-operations-on-objects
	        // 7.3.9 GetMethod(V, P)
	        // https://tc39.github.io/ecma262/#sec-getmethod
	        function GetMethod(V, P) {
	            var func = V[P];
	            if (func === undefined || func === null)
	                return undefined;
	            if (!IsCallable(func))
	                throw new TypeError();
	            return func;
	        }
	        // 7.4 Operations on Iterator Objects
	        // https://tc39.github.io/ecma262/#sec-operations-on-iterator-objects
	        function GetIterator(obj) {
	            var method = GetMethod(obj, iteratorSymbol);
	            if (!IsCallable(method))
	                throw new TypeError(); // from Call
	            var iterator = method.call(obj);
	            if (!IsObject(iterator))
	                throw new TypeError();
	            return iterator;
	        }
	        // 7.4.4 IteratorValue(iterResult)
	        // https://tc39.github.io/ecma262/2016/#sec-iteratorvalue
	        function IteratorValue(iterResult) {
	            return iterResult.value;
	        }
	        // 7.4.5 IteratorStep(iterator)
	        // https://tc39.github.io/ecma262/#sec-iteratorstep
	        function IteratorStep(iterator) {
	            var result = iterator.next();
	            return result.done ? false : result;
	        }
	        // 7.4.6 IteratorClose(iterator, completion)
	        // https://tc39.github.io/ecma262/#sec-iteratorclose
	        function IteratorClose(iterator) {
	            var f = iterator["return"];
	            if (f)
	                f.call(iterator);
	        }
	        // 9.1 Ordinary Object Internal Methods and Internal Slots
	        // https://tc39.github.io/ecma262/#sec-ordinary-object-internal-methods-and-internal-slots
	        // 9.1.1.1 OrdinaryGetPrototypeOf(O)
	        // https://tc39.github.io/ecma262/#sec-ordinarygetprototypeof
	        function OrdinaryGetPrototypeOf(O) {
	            var proto = Object.getPrototypeOf(O);
	            if (typeof O !== "function" || O === functionPrototype)
	                return proto;
	            // TypeScript doesn't set __proto__ in ES5, as it's non-standard.
	            // Try to determine the superclass constructor. Compatible implementations
	            // must either set __proto__ on a subclass constructor to the superclass constructor,
	            // or ensure each class has a valid `constructor` property on its prototype that
	            // points back to the constructor.
	            // If this is not the same as Function.[[Prototype]], then this is definately inherited.
	            // This is the case when in ES6 or when using __proto__ in a compatible browser.
	            if (proto !== functionPrototype)
	                return proto;
	            // If the super prototype is Object.prototype, null, or undefined, then we cannot determine the heritage.
	            var prototype = O.prototype;
	            var prototypeProto = prototype && Object.getPrototypeOf(prototype);
	            if (prototypeProto == null || prototypeProto === Object.prototype)
	                return proto;
	            // If the constructor was not a function, then we cannot determine the heritage.
	            var constructor = prototypeProto.constructor;
	            if (typeof constructor !== "function")
	                return proto;
	            // If we have some kind of self-reference, then we cannot determine the heritage.
	            if (constructor === O)
	                return proto;
	            // we have a pretty good guess at the heritage.
	            return constructor;
	        }
	        // naive Map shim
	        function CreateMapPolyfill() {
	            var cacheSentinel = {};
	            var arraySentinel = [];
	            var MapIterator = /** @class */ (function () {
	                function MapIterator(keys, values, selector) {
	                    this._index = 0;
	                    this._keys = keys;
	                    this._values = values;
	                    this._selector = selector;
	                }
	                MapIterator.prototype["@@iterator"] = function () { return this; };
	                MapIterator.prototype[iteratorSymbol] = function () { return this; };
	                MapIterator.prototype.next = function () {
	                    var index = this._index;
	                    if (index >= 0 && index < this._keys.length) {
	                        var result = this._selector(this._keys[index], this._values[index]);
	                        if (index + 1 >= this._keys.length) {
	                            this._index = -1;
	                            this._keys = arraySentinel;
	                            this._values = arraySentinel;
	                        }
	                        else {
	                            this._index++;
	                        }
	                        return { value: result, done: false };
	                    }
	                    return { value: undefined, done: true };
	                };
	                MapIterator.prototype.throw = function (error) {
	                    if (this._index >= 0) {
	                        this._index = -1;
	                        this._keys = arraySentinel;
	                        this._values = arraySentinel;
	                    }
	                    throw error;
	                };
	                MapIterator.prototype.return = function (value) {
	                    if (this._index >= 0) {
	                        this._index = -1;
	                        this._keys = arraySentinel;
	                        this._values = arraySentinel;
	                    }
	                    return { value: value, done: true };
	                };
	                return MapIterator;
	            }());
	            return /** @class */ (function () {
	                function Map() {
	                    this._keys = [];
	                    this._values = [];
	                    this._cacheKey = cacheSentinel;
	                    this._cacheIndex = -2;
	                }
	                Object.defineProperty(Map.prototype, "size", {
	                    get: function () { return this._keys.length; },
	                    enumerable: true,
	                    configurable: true
	                });
	                Map.prototype.has = function (key) { return this._find(key, /*insert*/ false) >= 0; };
	                Map.prototype.get = function (key) {
	                    var index = this._find(key, /*insert*/ false);
	                    return index >= 0 ? this._values[index] : undefined;
	                };
	                Map.prototype.set = function (key, value) {
	                    var index = this._find(key, /*insert*/ true);
	                    this._values[index] = value;
	                    return this;
	                };
	                Map.prototype.delete = function (key) {
	                    var index = this._find(key, /*insert*/ false);
	                    if (index >= 0) {
	                        var size = this._keys.length;
	                        for (var i = index + 1; i < size; i++) {
	                            this._keys[i - 1] = this._keys[i];
	                            this._values[i - 1] = this._values[i];
	                        }
	                        this._keys.length--;
	                        this._values.length--;
	                        if (key === this._cacheKey) {
	                            this._cacheKey = cacheSentinel;
	                            this._cacheIndex = -2;
	                        }
	                        return true;
	                    }
	                    return false;
	                };
	                Map.prototype.clear = function () {
	                    this._keys.length = 0;
	                    this._values.length = 0;
	                    this._cacheKey = cacheSentinel;
	                    this._cacheIndex = -2;
	                };
	                Map.prototype.keys = function () { return new MapIterator(this._keys, this._values, getKey); };
	                Map.prototype.values = function () { return new MapIterator(this._keys, this._values, getValue); };
	                Map.prototype.entries = function () { return new MapIterator(this._keys, this._values, getEntry); };
	                Map.prototype["@@iterator"] = function () { return this.entries(); };
	                Map.prototype[iteratorSymbol] = function () { return this.entries(); };
	                Map.prototype._find = function (key, insert) {
	                    if (this._cacheKey !== key) {
	                        this._cacheIndex = this._keys.indexOf(this._cacheKey = key);
	                    }
	                    if (this._cacheIndex < 0 && insert) {
	                        this._cacheIndex = this._keys.length;
	                        this._keys.push(key);
	                        this._values.push(undefined);
	                    }
	                    return this._cacheIndex;
	                };
	                return Map;
	            }());
	            function getKey(key, _) {
	                return key;
	            }
	            function getValue(_, value) {
	                return value;
	            }
	            function getEntry(key, value) {
	                return [key, value];
	            }
	        }
	        // naive Set shim
	        function CreateSetPolyfill() {
	            return /** @class */ (function () {
	                function Set() {
	                    this._map = new _Map();
	                }
	                Object.defineProperty(Set.prototype, "size", {
	                    get: function () { return this._map.size; },
	                    enumerable: true,
	                    configurable: true
	                });
	                Set.prototype.has = function (value) { return this._map.has(value); };
	                Set.prototype.add = function (value) { return this._map.set(value, value), this; };
	                Set.prototype.delete = function (value) { return this._map.delete(value); };
	                Set.prototype.clear = function () { this._map.clear(); };
	                Set.prototype.keys = function () { return this._map.keys(); };
	                Set.prototype.values = function () { return this._map.values(); };
	                Set.prototype.entries = function () { return this._map.entries(); };
	                Set.prototype["@@iterator"] = function () { return this.keys(); };
	                Set.prototype[iteratorSymbol] = function () { return this.keys(); };
	                return Set;
	            }());
	        }
	        // naive WeakMap shim
	        function CreateWeakMapPolyfill() {
	            var UUID_SIZE = 16;
	            var keys = HashMap.create();
	            var rootKey = CreateUniqueKey();
	            return /** @class */ (function () {
	                function WeakMap() {
	                    this._key = CreateUniqueKey();
	                }
	                WeakMap.prototype.has = function (target) {
	                    var table = GetOrCreateWeakMapTable(target, /*create*/ false);
	                    return table !== undefined ? HashMap.has(table, this._key) : false;
	                };
	                WeakMap.prototype.get = function (target) {
	                    var table = GetOrCreateWeakMapTable(target, /*create*/ false);
	                    return table !== undefined ? HashMap.get(table, this._key) : undefined;
	                };
	                WeakMap.prototype.set = function (target, value) {
	                    var table = GetOrCreateWeakMapTable(target, /*create*/ true);
	                    table[this._key] = value;
	                    return this;
	                };
	                WeakMap.prototype.delete = function (target) {
	                    var table = GetOrCreateWeakMapTable(target, /*create*/ false);
	                    return table !== undefined ? delete table[this._key] : false;
	                };
	                WeakMap.prototype.clear = function () {
	                    // NOTE: not a real clear, just makes the previous data unreachable
	                    this._key = CreateUniqueKey();
	                };
	                return WeakMap;
	            }());
	            function CreateUniqueKey() {
	                var key;
	                do
	                    key = "@@WeakMap@@" + CreateUUID();
	                while (HashMap.has(keys, key));
	                keys[key] = true;
	                return key;
	            }
	            function GetOrCreateWeakMapTable(target, create) {
	                if (!hasOwn.call(target, rootKey)) {
	                    if (!create)
	                        return undefined;
	                    Object.defineProperty(target, rootKey, { value: HashMap.create() });
	                }
	                return target[rootKey];
	            }
	            function FillRandomBytes(buffer, size) {
	                for (var i = 0; i < size; ++i)
	                    buffer[i] = Math.random() * 0xff | 0;
	                return buffer;
	            }
	            function GenRandomBytes(size) {
	                if (typeof Uint8Array === "function") {
	                    if (typeof crypto !== "undefined")
	                        return crypto.getRandomValues(new Uint8Array(size));
	                    if (typeof msCrypto !== "undefined")
	                        return msCrypto.getRandomValues(new Uint8Array(size));
	                    return FillRandomBytes(new Uint8Array(size), size);
	                }
	                return FillRandomBytes(new Array(size), size);
	            }
	            function CreateUUID() {
	                var data = GenRandomBytes(UUID_SIZE);
	                // mark as random - RFC 4122 § 4.4
	                data[6] = data[6] & 0x4f | 0x40;
	                data[8] = data[8] & 0xbf | 0x80;
	                var result = "";
	                for (var offset = 0; offset < UUID_SIZE; ++offset) {
	                    var byte = data[offset];
	                    if (offset === 4 || offset === 6 || offset === 8)
	                        result += "-";
	                    if (byte < 16)
	                        result += "0";
	                    result += byte.toString(16).toLowerCase();
	                }
	                return result;
	            }
	        }
	        // uses a heuristic used by v8 and chakra to force an object into dictionary mode.
	        function MakeDictionary(obj) {
	            obj.__ = undefined;
	            delete obj.__;
	            return obj;
	        }
	    });
	})(Reflect || (Reflect = {}));
	return _Reflect;
}

let defaultGetErrorObject = undefined;

function checkGetErrorObject(getErrorObject) {
    if (typeof getErrorObject !== 'function') {
        throw new Error('This module should not be used in runtime. Instead, use a transformer during compilation.');
    }
}

const assertionsMetadataKey = Symbol('assertions');

function inputObjectAtPath(path, inputObject) {
    let subField = inputObject;
    for (const key of path.slice(1)) {
        subField = subField[
            key.startsWith("[") ? parseInt(key.replace("[", "").replace("]", "")) : key
        ];
    }
    return subField;
}

function appendInputToErrorMessage(message, path, inputObject) {
    if (message === undefined)
        return 'validation error';
    const foundInputObject = inputObjectAtPath(path, inputObject);
    try {
        return message + ', found: ' + requireUtil().inspect(foundInputObject);
    } catch (error) {
    }
    try {
        return message + ', found: ' + JSON.stringify(foundInputObject);
    } catch (error) {
    }
    return message;
}

class TypeGuardError extends Error {
    constructor(errorObject, inputObject) {
        super(appendInputToErrorMessage(errorObject.message, errorObject.path, inputObject));
        this.name = 'TypeGuardError';
        this.path = errorObject.path;
        this.reason = errorObject.reason;
        this.input = inputObject;
    }
}

function AssertType(assertion, options = {}) {
    require_Reflect();
    return function (target, propertyKey, parameterIndex) {
        const assertions = Reflect.getOwnMetadata(assertionsMetadataKey, target, propertyKey) || [];
        if(Reflect.getOwnMetadata('design:returntype', target, propertyKey) === Promise) {
            assertions[parameterIndex] = { assertion, options: Object.assign({ async: true }, options) };
        } else {
            assertions[parameterIndex] = { assertion, options };
        }
        Reflect.defineMetadata(assertionsMetadataKey, assertions, target, propertyKey);
    };
}

function ValidateClass(errorConstructor = TypeGuardError) {
    require_Reflect();
    return function (target) {
        for (const propertyKey of Object.getOwnPropertyNames(target.prototype)) {
            const assertions = Reflect.getOwnMetadata(assertionsMetadataKey, target.prototype, propertyKey);
            if (assertions) {
                const originalMethod = target.prototype[propertyKey];
                target.prototype[propertyKey] = function (...args) {
                    for (let i = 0; i < assertions.length; i++) {
                        if (!assertions[i]) {
                            continue;
                        }
                        const errorObject = assertions[i].assertion(args[i]);
                        if (errorObject !== null) {
                            const errorInstance = new errorConstructor(errorObject, args[i]);
                            if(assertions[i].options.async) {
                                return Promise.reject(errorInstance);
                            } else {
                                throw errorInstance;
                            }
                        }
                    }
                    return originalMethod.apply(this, args);
                };
            }
        }
    };
}

function is(obj, getErrorObject = defaultGetErrorObject) {
    checkGetErrorObject(getErrorObject);
    const errorObject = getErrorObject(obj);
    return errorObject === null;
}

function assertType(obj, getErrorObject = defaultGetErrorObject) {
    checkGetErrorObject(getErrorObject);
    const errorObject = getErrorObject(obj);
    if (errorObject === null) {
        return obj;
    } else {
        throw new TypeGuardError(errorObject, obj);
    }
}

function createIs(getErrorObject = defaultGetErrorObject) {
    checkGetErrorObject(getErrorObject);
    return (obj) => is(obj, getErrorObject);
}

function createAssertType(getErrorObject = defaultGetErrorObject) {
    checkGetErrorObject(getErrorObject);
    return (obj) => assertType(obj, getErrorObject);
}

function setDefaultGetErrorObject(getErrorObject) {
    defaultGetErrorObject = getErrorObject;
}

var typescriptIs = {
    is,
    assertType,
    createIs,
    createAssertType,
    equals: is,
    createEquals: createIs,
    assertEquals: assertType,
    createAssertEquals: createAssertType,
    AssertType,
    ValidateClass,
    TypeGuardError,
    setDefaultGetErrorObject
};

var __awaiter$1 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __rest = (undefined && undefined.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
function ArweaveApi(Base) {
    return class Arweave extends Base {
        constructor(...args) {
            super(...args);
            this.namespaces = {
                arweaveWallet: {
                    walletName: 'ArConnect',
                    connect: () => this.address || this.connect(),
                    disconnect: () => this.disconnect(),
                    getActiveAddress: () => this.address,
                    getActivePublicKey: () => this.getPublicKey(),
                    getAllAddresses: () => { throw 'not implemented'; },
                    getWalletNames: () => { throw 'not implemented'; },
                    sign: (tx, options) => this.signTransaction(tx, options),
                    dispatch: (tx, options) => this.dispatch(tx, options),
                    encrypt: () => { throw 'not implemented'; },
                    decrypt: (data, options) => this.decrypt(data, options),
                    getPermissions: () => ["ACCESS_ADDRESS", "ACCESS_PUBLIC_KEY", "ACCESS_ALL_ADDRESSES", "SIGN_TRANSACTION", "ENCRYPT", "DECRYPT", "SIGNATURE", "ACCESS_ARWEAVE_CONFIG", "DISPATCH",],
                    getArweaveConfig: () => this.getArweaveConfig(),
                },
            };
        }
        postMessage(method, params, options) {
            return super.postMessage(method, params, Object.assign(Object.assign({}, options), { protocol: 'arweave', version: '1.0.0' }));
        }
        getPublicKey() {
            return __awaiter$1(this, void 0, void 0, function* () {
                const res = yield this.postMessage('getPublicKey');
                if (!typescriptIs.is(res, object => { function _string(object) { if (typeof object !== "string")
                    return {};
                else
                    return null; } return _string(object); })) {
                    throw 'TypeError';
                }
                return res;
            });
        }
        getArweaveConfig() {
            return __awaiter$1(this, void 0, void 0, function* () {
                const res = yield this.postMessage('getArweaveConfig');
                if (!typescriptIs.is(res, object => { function _undefined(object) { if (object !== undefined)
                    return {};
                else
                    return null; } function _string(object) { if (typeof object !== "string")
                    return {};
                else
                    return null; } function su__undefined__string_eu(object) { var conditions = [_undefined, _string]; for (const condition of conditions) {
                    var error = condition(object);
                    if (!error)
                        return null;
                } return {}; } function _number(object) { if (typeof object !== "number")
                    return {};
                else
                    return null; } function su__undefined__string__number_eu(object) { var conditions = [_undefined, _string, _number]; for (const condition of conditions) {
                    var error = condition(object);
                    if (!error)
                        return null;
                } return {}; } function su__undefined__number_eu(object) { var conditions = [_undefined, _number]; for (const condition of conditions) {
                    var error = condition(object);
                    if (!error)
                        return null;
                } return {}; } function _false(object) { if (object !== false)
                    return {};
                else
                    return null; } function _true(object) { if (object !== true)
                    return {};
                else
                    return null; } function su__undefined__10__11_eu(object) { var conditions = [_undefined, _false, _true]; for (const condition of conditions) {
                    var error = condition(object);
                    if (!error)
                        return null;
                } return {}; } function _1(object) { if (typeof object !== "object" || object === null || Array.isArray(object))
                    return {}; {
                    if ("protocol" in object) {
                        var error = su__undefined__string_eu(object["protocol"]);
                        if (error)
                            return error;
                    }
                } {
                    if ("host" in object) {
                        var error = su__undefined__string_eu(object["host"]);
                        if (error)
                            return error;
                    }
                } {
                    if ("port" in object) {
                        var error = su__undefined__string__number_eu(object["port"]);
                        if (error)
                            return error;
                    }
                } {
                    if ("timeout" in object) {
                        var error = su__undefined__number_eu(object["timeout"]);
                        if (error)
                            return error;
                    }
                } {
                    if ("logging" in object) {
                        var error = su__undefined__10__11_eu(object["logging"]);
                        if (error)
                            return error;
                    }
                } return null; } function _any() { return null; } function _2(object) { if (typeof object !== "object" || object === null || Array.isArray(object))
                    return {}; {
                    if ("logger" in object) {
                        var error = _any(object["logger"]);
                        if (error)
                            return error;
                    }
                } return null; } function si__1__2_ei(object) { var conditions = [_1, _2]; for (const condition of conditions) {
                    var error = condition(object);
                    if (error)
                        return error;
                } return null; } return si__1__2_ei(object); })) {
                    throw 'TypeError';
                }
                delete res.logger;
                return res;
            });
        }
        signTransaction(tx, options) {
            var _a;
            return __awaiter$1(this, void 0, void 0, function* () {
                const txHeader = __rest(tx, ["data", "chunks"]);
                const res = yield this.postMessage('signTransaction', [txHeader, options]);
                if (!typescriptIs.is(res, object => { function _string(object) { if (typeof object !== "string")
                    return {};
                else
                    return null; } function _undefined(object) { if (object !== undefined)
                    return {};
                else
                    return null; } function _null(object) { if (object !== null)
                    return {};
                else
                    return null; } function su__undefined__null__string_eu(object) { var conditions = [_undefined, _null, _string]; for (const condition of conditions) {
                    var error = condition(object);
                    if (!error)
                        return null;
                } return {}; } function _9(object) { if (typeof object !== "object" || object === null || Array.isArray(object))
                    return {}; {
                    if ("name" in object) {
                        var error = _string(object["name"]);
                        if (error)
                            return error;
                    }
                    else
                        return {};
                } {
                    if ("value" in object) {
                        var error = _string(object["value"]);
                        if (error)
                            return error;
                    }
                    else
                        return {};
                } return null; } function sa__9_ea_9(object) { if (!Array.isArray(object))
                    return {}; for (let i = 0; i < object.length; i++) {
                    var error = _9(object[i]);
                    if (error)
                        return error;
                } return null; } function su__undefined__null_sa__9_ea_9_9_9_eu(object) { var conditions = [_undefined, _null, sa__9_ea_9]; for (const condition of conditions) {
                    var error = condition(object);
                    if (!error)
                        return null;
                } return {}; } function _0(object) { if (typeof object !== "object" || object === null || Array.isArray(object))
                    return {}; {
                    if ("id" in object) {
                        var error = _string(object["id"]);
                        if (error)
                            return error;
                    }
                    else
                        return {};
                } {
                    if ("owner" in object) {
                        var error = su__undefined__null__string_eu(object["owner"]);
                        if (error)
                            return error;
                    }
                } {
                    if ("tags" in object) {
                        var error = su__undefined__null_sa__9_ea_9_9_9_eu(object["tags"]);
                        if (error)
                            return error;
                    }
                } {
                    if ("signature" in object) {
                        var error = _string(object["signature"]);
                        if (error)
                            return error;
                    }
                    else
                        return {};
                } {
                    if ("reward" in object) {
                        var error = su__undefined__null__string_eu(object["reward"]);
                        if (error)
                            return error;
                    }
                } return null; } return _0(object); })) {
                    throw 'TypeError';
                }
                tx.setSignature({
                    id: res.id,
                    owner: res.owner || tx.owner,
                    tags: (_a = res.tags) === null || _a === void 0 ? void 0 : _a.map(tag => new transactionExports.Tag(tag.name, tag.value, true)),
                    signature: res.signature,
                    reward: res.reward || undefined
                });
                return tx;
            });
        }
        dispatch(tx, options) {
            return __awaiter$1(this, void 0, void 0, function* () {
                const res = yield this.postMessage('dispatch', [tx, options], { transfer: true });
                if (!typescriptIs.is(res, object => { function _string(object) { if (typeof object !== "string")
                    return {};
                else
                    return null; } function _2(object) { if (object !== "BASE")
                    return {};
                else
                    return null; } function _3(object) { if (object !== "BUNDLED")
                    return {};
                else
                    return null; } function su__2__3_eu(object) { var conditions = [_2, _3]; for (const condition of conditions) {
                    var error = condition(object);
                    if (!error)
                        return null;
                } return {}; } function _0(object) { if (typeof object !== "object" || object === null || Array.isArray(object))
                    return {}; {
                    if ("id" in object) {
                        var error = _string(object["id"]);
                        if (error)
                            return error;
                    }
                } {
                    if ("type" in object) {
                        var error = su__2__3_eu(object["type"]);
                        if (error)
                            return error;
                    }
                } return null; } return _0(object); })) {
                    throw 'TypeError';
                }
                return res;
            });
        }
        decrypt(message, options) {
            return __awaiter$1(this, void 0, void 0, function* () {
                const res = yield this.postMessage('decrypt', [message, options]);
                if (!ArrayBuffer.isView(res)) {
                    throw 'TypeError';
                }
                const constructor = message.constructor;
                return new constructor(res.buffer);
            });
        }
    };
}

function mitt(n){return {all:n=n||new Map,on:function(t,e){var i=n.get(t);i?i.push(e):n.set(t,[e]);},off:function(t,e){var i=n.get(t);i&&(e?i.splice(i.indexOf(e)>>>0,1):n.set(t,[]));},emit:function(t,e){var i=n.get(t);i&&i.slice().map(function(n){n(e);}),(i=n.get("*"))&&i.slice().map(function(n){n(t,e);});}}}

class Emitter {
    constructor() {
        this.mittInstance = mitt();
    }
    emit(method, params) {
        this.mittInstance.emit(method, params);
    }
    on(method, handler) {
        this.mittInstance.on(method, handler);
    }
    off(method, handler) {
        this.mittInstance.off(method, handler);
    }
    once(method, handler) {
        return new Promise(resolve => {
            const wrapper = (e) => {
                this.off(method, wrapper);
                resolve(e);
                if (handler) {
                    handler(e);
                }
            };
            this.on(method, wrapper);
        });
    }
}

class PromiseController {
    constructor() {
        this._promiseController = [];
    }
    newMessagePromise(message, options) {
        message.id = this._promiseController.length;
        const promise = new Promise((resolve, reject) => this._promiseController.push({ resolve, reject }));
        if (options === null || options === void 0 ? void 0 : options.timeout) {
            setTimeout(() => this._promiseController[message.id].reject('timeout'), options.timeout);
        }
        return promise;
    }
    processResponse(message) {
        const { id, result, error } = message;
        if (id == null) {
            return;
        }
        if (typeof id !== 'number' && typeof id !== 'string') {
            throw 'error';
        }
        if (typeof id === 'string' && isNaN(parseInt(id))) {
            throw 'error';
        }
        if (!this._promiseController[+id]) {
            throw 'received result to nonexistent request';
        }
        if (error != null) {
            this._promiseController[+id].reject(error);
        }
        else {
            this._promiseController[+id].resolve(result);
        }
        return true;
    }
}

const WIDTH = '400';
const HEIGHT = '600';
class Bridge extends Emitter {
    constructor(connectToUrl, appInfo) {
        super();
        this._iframe = {};
        this._showIframe = false;
        this._popup = {};
        this._usePopup = true;
        this._requirePopup = false;
        this._keepPopup = false;
        this._promiseController = new PromiseController();
        this._pending = [];
        this.listener = (e) => {
            var _a, _b, _c, _d, _e, _f;
            if (e.source !== this._popup.window && e.source !== ((_a = this._iframe) === null || _a === void 0 ? void 0 : _a.window)) {
                return;
            }
            if (e.origin !== ((_b = this._url) === null || _b === void 0 ? void 0 : _b.origin)) {
                return;
            }
            if (typeof e.data !== 'object') {
                return;
            }
            const { method, params, id, result, error, session } = e.data;
            console.info(`WalletConnector:${e.source === this._popup.window ? 'popup' : 'iframe'}`, e.data);
            if (id != null) {
                this._pending = this._pending.filter(x => x != id);
            }
            if (this._promiseController.processResponse(e.data)) {
                return;
            }
            if (typeof method !== 'string') {
                return;
            }
            // reserved methods
            if (method === 'ready') {
                if (e.source === this._popup.window) {
                    (_d = (_c = this._popup).resolve) === null || _d === void 0 ? void 0 : _d.call(_c);
                }
                if (e.source === this._iframe.window) {
                    (_f = (_e = this._iframe).resolve) === null || _f === void 0 ? void 0 : _f.call(_e);
                }
                return;
            }
            if (method === 'change') {
                return;
            }
            // verified methods
            if (method === 'showIframe') {
                if (typeof params !== 'boolean') {
                    return;
                }
                this.showIframe = params;
            }
            if (method === 'usePopup') {
                if (typeof params !== 'boolean') {
                    return;
                }
                this.setUsePopup(params);
            }
            if (method === 'keepPopup') {
                if (typeof params !== 'boolean') {
                    return;
                }
                this.setRequirePopup(params);
            }
            const emitting = { method, params, session };
            if (!typescriptIs.is(emitting, object => { function _string(object) { if (typeof object !== "string")
                return {};
            else
                return null; } function _unknown() { return null; } function _undefined(object) { if (object !== undefined)
                return {};
            else
                return null; } function _number(object) { if (typeof object !== "number")
                return {};
            else
                return null; } function su__undefined__string__number_eu(object) { var conditions = [_undefined, _string, _number]; for (const condition of conditions) {
                var error = condition(object);
                if (!error)
                    return null;
            } return {}; } function _0(object) { if (typeof object !== "object" || object === null || Array.isArray(object))
                return {}; {
                if ("method" in object) {
                    var error = _string(object["method"]);
                    if (error)
                        return error;
                }
                else
                    return {};
            } {
                if ("params" in object) {
                    var error = _unknown(object["params"]);
                    if (error)
                        return error;
                }
                else
                    return {};
            } {
                if ("session" in object) {
                    var error = su__undefined__string__number_eu(object["session"]);
                    if (error)
                        return error;
                }
            } return null; } return _0(object); })) {
                return console.warn('dropped');
            }
            this.emit('message', emitting);
        };
        this._iframeParentNode = appInfo === null || appInfo === void 0 ? void 0 : appInfo.iframeParentNode;
        this._url = connectToUrl;
        const urlInfo = {
            origin: window.location.origin,
            session: Math.random().toString().slice(2)
        };
        if (appInfo === null || appInfo === void 0 ? void 0 : appInfo.name) {
            urlInfo.name = appInfo.name;
        }
        if (appInfo === null || appInfo === void 0 ? void 0 : appInfo.logo) {
            urlInfo.logo = appInfo.logo;
        }
        this._url.hash = new URLSearchParams(urlInfo).toString();
        window.addEventListener('message', this.listener);
    }
    get url() { var _a; return (_a = this._url) === null || _a === void 0 ? void 0 : _a.origin; }
    get showIframe() { return this._showIframe; }
    set showIframe(value) {
        if (value === this._showIframe) {
            return;
        }
        this._showIframe = value;
        this.deliverMessage({ method: 'showIframe', params: value });
        this.emit('builtin', { showIframe: value });
        if (!this._iframeNode) {
            return;
        }
        if (!this._iframeParentNode) {
            this._iframeNode.style.opacity = value ? '1' : '0';
            value ? this._iframeNode.style.removeProperty('pointer-events') : this._iframeNode.style.pointerEvents = 'none';
            value ? this._iframeNode.style.removeProperty('touch-action') : this._iframeNode.style.touchAction = 'none';
            value ? this._iframeNode.style.zIndex = '1000000' : this._iframeNode.style.zIndex = '-1000000';
            value ? this._iframeNode.style.transition = 'opacity 0.2s ease' : this._iframeNode.style.transition = 'opacity 0.2s ease, z-index 0s linear 0.2s';
        }
    }
    get usePopup() { return this._usePopup; }
    setUsePopup(value) {
        if (value === this._usePopup) {
            return;
        }
        this._usePopup = value;
        this.emit('builtin', { usePopup: value });
    }
    get requirePopup() { return this._requirePopup; }
    setRequirePopup(value) {
        if (value === this._requirePopup) {
            return;
        }
        this._requirePopup = value;
        this.emit('builtin', { requirePopup: value });
    }
    get keepPopup() { return this._keepPopup; }
    set keepPopup(value) {
        this._keepPopup = value;
        this.emit('builtin', { keepPopup: value });
        if (!value) {
            this.closePopup();
        }
        if (value) {
            this.openPopup(true);
        }
    }
    destructor(options) {
        this.closeIframe();
        this.closePopup(true);
        window.removeEventListener('message', this.listener);
    }
    postMessage(message, options) {
        const promise = this._promiseController.newMessagePromise(message, options).finally(() => this.completeRequest());
        this.deliverMessage(message);
        return promise;
    }
    openIframe() {
        if (this._iframeEl) {
            return;
        }
        this._iframeNode = document.createElement('div');
        this._iframeEl = document.createElement('iframe');
        this._iframeEl.src = this._url.toString();
        this._iframeEl.allow = 'usb; camera; payment; web-share';
        this._iframeEl.style.border = 'none';
        if (!this._iframeParentNode) {
            this._iframeEl.width = WIDTH;
            this._iframeEl.height = HEIGHT;
            this._iframeEl.style.borderRadius = '8px';
            this._iframeEl.style.maxWidth = '100%';
            this._iframeEl.style.maxHeight = '100%';
            this._iframeNode.style.position = 'fixed';
            this._iframeNode.style.inset = '0';
            this._iframeNode.style.display = 'flex';
            this._iframeNode.style.alignItems = 'center';
            this._iframeNode.style.justifyContent = 'center';
            this._iframeNode.style.background = '#00000088';
            this._iframeNode.style.opacity = '0';
            this._iframeNode.style.pointerEvents = 'none';
            this._iframeNode.style.touchAction = 'none';
            this._iframeNode.style.zIndex = '-1000000';
            this._iframeNode.style.transition = 'opacity 0.2s ease, z-index 0s linear 0.2s';
        }
        this._iframeNode.appendChild(this._iframeEl);
        const promise = new Promise((resolve, reject) => this._iframe = { resolve, reject });
        this._iframe.promise = promise;
        const injectIframe = () => {
            var _a;
            if (this._iframeParentNode) {
                this._iframeParentNode.appendChild(this._iframeNode);
            }
            else {
                document.body.appendChild(this._iframeNode);
            }
            this._iframe.window = (_a = this._iframeEl) === null || _a === void 0 ? void 0 : _a.contentWindow;
        };
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            injectIframe();
        }
        else {
            document.addEventListener('DOMContentLoaded', injectIframe);
        }
    }
    closeIframe() {
        var _a, _b, _c, _d;
        (_a = this._iframeEl) === null || _a === void 0 ? void 0 : _a.setAttribute('src', 'about:blank');
        (_b = this._iframeNode) === null || _b === void 0 ? void 0 : _b.remove();
        this._iframeNode = undefined;
        this._iframeEl = undefined;
        (_d = (_c = this._iframe).reject) === null || _d === void 0 ? void 0 : _d.call(_c);
        this._iframe = {};
    }
    openPopup(force) {
        if (this._popup.window && !this._popup.window.closed) {
            this._popup.window.focus();
            return;
        }
        if (!this.usePopup && !force) {
            return;
        }
        window.name = 'parent';
        const popupWindow = window.open(this._url.toString(), '_blank', `location,resizable,scrollbars,width=${WIDTH},height=${HEIGHT}`);
        const promise = new Promise((resolve, reject) => this._popup = { window: popupWindow, resolve, reject });
        this._popup.promise = promise;
        const timer = setInterval(() => {
            if (this._popup.window && !this._popup.window.closed) {
                return;
            }
            if (this.keepPopup) {
                this.keepPopup = false;
            }
            clearInterval(timer);
        }, 200);
    }
    closePopup(force) {
        var _a, _b, _c;
        if (!this._popup.window || ((_a = this._popup.window) === null || _a === void 0 ? void 0 : _a.closed)) {
            return;
        }
        // todo test multiple instances behavior
        // todo if keepPopup -> might require a return back to prev page if on mobile
        if ((this.keepPopup || this.requirePopup) && !force) {
            return;
        }
        this._popup.window.location.href = 'about:blank';
        this._popup.window.close();
        (_c = (_b = this._popup).reject) === null || _c === void 0 ? void 0 : _c.call(_b);
        this._popup = {};
    }
    completeRequest() {
        setTimeout(() => {
            if (this._pending.length) {
                return;
            }
            this.closePopup();
            this.showIframe = false;
        }, 100);
    }
    deliverMessage(message, options) {
        var _a, _b;
        if (!this._url) {
            throw 'Missing URL';
        }
        console.info(`WalletConnector:post`, message);
        const fullMessage = Object.assign(Object.assign({}, message), { jsonrpc: '2.0' });
        fullMessage.id != null && this._pending.push(fullMessage.id);
        this.openIframe();
        this._iframe.promise = (_a = this._iframe.promise) === null || _a === void 0 ? void 0 : _a.then(() => { var _a; return (_a = this._iframe.window) === null || _a === void 0 ? void 0 : _a.postMessage(fullMessage, this._url.origin, (options === null || options === void 0 ? void 0 : options.transfer) ? [fullMessage] : undefined); }).catch(() => { return; });
        this.openPopup();
        this._popup.promise = (_b = this._popup.promise) === null || _b === void 0 ? void 0 : _b.then(() => { var _a; return (_a = this._popup.window) === null || _a === void 0 ? void 0 : _a.postMessage(fullMessage, this._url.origin, (options === null || options === void 0 ? void 0 : options.transfer) ? [fullMessage] : undefined); }).catch(() => { return; });
    }
}

function generateUrl(url) {
    if (typeof url === 'object') {
        return url;
    }
    if (!url.includes('://')) {
        url = 'https://' + url;
    }
    return new URL(url);
}

let interval;
const connectors = [];
const loaded = {};
const swaps = {};
function load(connector) {
    if (!connector.namespaces) {
        return;
    }
    if (!connectors.find(c => c === connector)) {
        connectors.push(connector);
    }
    update();
}
function unload(connector) {
    if (!connectors.find(c => c === connector)) {
        return update();
    }
    connectors.splice(connectors.indexOf(connector), 1);
    for (const namespace in connector.namespaces) {
        if (loaded[namespace] !== connector) {
            continue;
        }
        window[namespace] = swaps[namespace];
        delete swaps[namespace];
        delete loaded[namespace];
    }
    update();
}
function update() {
    for (const connector of connectors) {
        for (const namespace in connector.namespaces) {
            if (loaded[namespace] && loaded[namespace] !== connector) {
                continue;
            }
            if (window[namespace] === connector.namespaces[namespace]) {
                continue;
            }
            swaps[namespace] = window[namespace];
            window[namespace] = connector.namespaces[namespace];
            loaded[namespace] = connector;
        }
    }
    window.clearInterval(interval);
    if (connectors.length) {
        interval = setInterval(() => update(), 10000);
    }
}

const windowMissing = 'Window context missing. If you are using a server side rendering framework, make sure that the connector is excluded. If you want to use the connector outside the browser, use the node version of the module instead';

var __awaiter = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
// todo disable multiple instances
class BrowserConnector extends Emitter {
    constructor(appInfo, connectToUrl) {
        super();
        this._session = 0;
        this._listener = (message) => {
            const { method, params, session } = message;
            if (session != null && this._session != session) {
                return;
            }
            if (!session && this._session) {
                return;
            }
            if (method === 'connect') {
                if (!typescriptIs.is(params, object => { function _string(object) { if (typeof object !== "string")
                    return {};
                else
                    return null; } return _string(object); })) {
                    return;
                }
                this.setAddress(params);
            }
            if (method === 'disconnect') {
                this.disconnectEvent(false);
            }
        };
        this._appInfo = appInfo;
        this._emitterPassthrough = (param) => {
            const event = Object.entries(param)[0];
            this.emit(event[0], event[1]);
        };
        this.on('connect', () => load(this));
        this.on('disconnect', () => unload(this));
        if (connectToUrl) {
            this.setUrl(connectToUrl);
        }
    }
    get address() { return this._address; }
    setAddress(value) {
        if (value && value === this.address) {
            return;
        }
        this._address = value;
        value != null ? this.emit('connect', value) : this.emit('disconnect', value);
        this.emit('change', value);
    }
    get connected() { return this._address != null; }
    get url() { var _a; return (_a = this._bridge) === null || _a === void 0 ? void 0 : _a.url; }
    get showIframe() { var _a; return ((_a = this._bridge) === null || _a === void 0 ? void 0 : _a.showIframe) || false; }
    get usePopup() { var _a; return ((_a = this._bridge) === null || _a === void 0 ? void 0 : _a.usePopup) || false; }
    get requirePopup() { var _a; return ((_a = this._bridge) === null || _a === void 0 ? void 0 : _a.requirePopup) || false; }
    get keepPopup() { var _a; return ((_a = this._bridge) === null || _a === void 0 ? void 0 : _a.keepPopup) || false; }
    set keepPopup(keep) { this._bridge && (this._bridge.keepPopup = keep); }
    setUrl(connectToUrl) {
        var _a;
        if (!window) {
            console.error(windowMissing);
            return;
        }
        const oldBridge = this._bridge;
        const url = generateUrl(connectToUrl);
        this._url = url;
        if (((_a = this._bridge) === null || _a === void 0 ? void 0 : _a.url) === url.origin) {
            return;
        }
        this.disconnect();
        if (!BrowserConnector._bridges[url.origin]) {
            this._bridge = new Bridge(url, this._appInfo);
            BrowserConnector._bridges[url.origin] = { bridge: this._bridge, sessions: [] };
        }
        else {
            this._bridge = BrowserConnector._bridges[url.origin].bridge;
            const sessions = BrowserConnector._bridges[url.origin].sessions;
            for (let i = 0; i <= sessions.length; i++) {
                if (sessions.indexOf(i) < 0) {
                    this._session = i;
                    break;
                }
            }
        }
        BrowserConnector._bridges[url.origin].sessions.push(this._session);
        this._bridge.on('message', this._listener);
        this._bridge.on('builtin', this._emitterPassthrough);
        if (this._bridge.showIframe !== (oldBridge === null || oldBridge === void 0 ? void 0 : oldBridge.showIframe)) {
            this.emit('showIframe', this._bridge.showIframe);
        }
        if (this._bridge.usePopup !== (oldBridge === null || oldBridge === void 0 ? void 0 : oldBridge.usePopup)) {
            this.emit('usePopup', this._bridge.usePopup);
        }
        if (this._bridge.requirePopup !== (oldBridge === null || oldBridge === void 0 ? void 0 : oldBridge.requirePopup)) {
            this.emit('requirePopup', this._bridge.requirePopup);
        }
        if (this._bridge.keepPopup !== (oldBridge === null || oldBridge === void 0 ? void 0 : oldBridge.keepPopup)) {
            this.emit('keepPopup', this._bridge.keepPopup);
        }
    }
    connect(options) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this._bridge) {
                this._url && this.setUrl(this._url);
            }
            const promise = new Promise((resolve, reject) => {
                this.once('change', address => address ? resolve(address) : reject());
            }).finally(() => { var _a; return (_a = this._bridge) === null || _a === void 0 ? void 0 : _a.completeRequest(); });
            this._bridge.deliverMessage({ method: 'connect', params: options });
            return promise;
        });
    }
    disconnect(options) {
        return __awaiter(this, void 0, void 0, function* () { return this.disconnectEvent(true, options); });
    }
    disconnectEvent(fromMethod, options) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this._bridge) {
                return;
            }
            const oldBridge = this._bridge;
            const session = this._session;
            const url = oldBridge.url;
            this.setAddress(undefined);
            this._bridge = undefined;
            this._session = 0;
            if (fromMethod) {
                try {
                    yield oldBridge.postMessage({ method: 'disconnect', params: [options], session });
                }
                catch (e) {
                    console.warn('disconnect request failed');
                }
            }
            oldBridge.off('message', this._listener);
            oldBridge.off('builtin', this._emitterPassthrough);
            BrowserConnector._bridges[url].sessions = BrowserConnector._bridges[url].sessions.filter(x => x != session);
            setTimeout(() => {
                if (BrowserConnector._bridges[url].sessions.length) {
                    return;
                }
                BrowserConnector._bridges[url].bridge.destructor();
                delete BrowserConnector._bridges[url];
            }, 100);
        });
    }
    postMessage(method, params, options) {
        return new Promise((resolve, reject) => {
            if (!this._bridge) {
                return reject('URL missing');
            }
            this.once('disconnect', reject);
            this._bridge.postMessage({ method, params, session: this._session, protocol: options === null || options === void 0 ? void 0 : options.protocol, version: options === null || options === void 0 ? void 0 : options.version }, options).then(resolve).catch(reject);
        });
    }
}
BrowserConnector._bridges = {};

const ArweaveWebWallet = ArweaveApi(BrowserConnector);

/* src/Widget.svelte generated by Svelte v3.49.0 */

function create_default_slot(ctx) {
	let h2;
	let t1;
	let button0;
	let t3;
	let div;
	let ul;
	let li0;
	let button1;
	let t5;
	let li1;
	let button2;
	let mounted;
	let dispose;

	return {
		c() {
			h2 = element("h2");
			h2.textContent = "Connect Wallet";
			t1 = space();
			button0 = element("button");
			button0.textContent = "✕";
			t3 = space();
			div = element("div");
			ul = element("ul");
			li0 = element("li");
			button1 = element("button");
			button1.textContent = "ArConnect";
			t5 = space();
			li1 = element("li");
			button2 = element("button");
			button2.textContent = "Arweave.app";
			attr(h2, "class", "text-lg");
			attr(button0, "class", "btn btn-sm btn-circle absolute right-2 top-2");
			attr(button1, "class", "btn btn-ghost");
			attr(button2, "class", "btn btn-ghost");
			attr(div, "class", "mt-8");
		},
		m(target, anchor) {
			insert(target, h2, anchor);
			insert(target, t1, anchor);
			insert(target, button0, anchor);
			insert(target, t3, anchor);
			insert(target, div, anchor);
			append(div, ul);
			append(ul, li0);
			append(li0, button1);
			append(ul, t5);
			append(ul, li1);
			append(li1, button2);

			if (!mounted) {
				dispose = [
					listen(button0, "click", /*click_handler*/ ctx[6]),
					listen(button1, "click", /*arConnect*/ ctx[4]),
					listen(button2, "click", /*walletConnect*/ ctx[5])
				];

				mounted = true;
			}
		},
		p: noop,
		d(detaching) {
			if (detaching) detach(h2);
			if (detaching) detach(t1);
			if (detaching) detach(button0);
			if (detaching) detach(t3);
			if (detaching) detach(div);
			mounted = false;
			run_all(dispose);
		}
	};
}

function create_fragment(ctx) {
	let div3;
	let div1;
	let div0;
	let t0;
	let t1;
	let t2;
	let div2;
	let button;
	let t3;
	let t4;
	let modal;
	let current;
	let mounted;
	let dispose;

	modal = new Modal({
			props: {
				open: /*connectDialog*/ ctx[1],
				ok: false,
				$$slots: { default: [create_default_slot] },
				$$scope: { ctx }
			}
		});

	return {
		c() {
			div3 = element("div");
			div1 = element("div");
			div0 = element("div");
			t0 = text("Permapage: ");
			t1 = text(/*transactionId*/ ctx[0]);
			t2 = space();
			div2 = element("div");
			button = element("button");
			t3 = text(/*connectBtnText*/ ctx[2]);
			t4 = space();
			create_component(modal.$$.fragment);
			attr(div0, "class", "normal-case text-xl");
			attr(div1, "class", "flex-1");
			attr(button, "class", "btn btn-primary");
			attr(div2, "class", "flex-none");
			attr(div3, "class", "navbar bg-base-100");
		},
		m(target, anchor) {
			insert(target, div3, anchor);
			append(div3, div1);
			append(div1, div0);
			append(div0, t0);
			append(div0, t1);
			append(div3, t2);
			append(div3, div2);
			append(div2, button);
			append(button, t3);
			insert(target, t4, anchor);
			mount_component(modal, target, anchor);
			current = true;

			if (!mounted) {
				dispose = listen(button, "click", /*handleClick*/ ctx[3]);
				mounted = true;
			}
		},
		p(ctx, [dirty]) {
			if (!current || dirty & /*transactionId*/ 1) set_data(t1, /*transactionId*/ ctx[0]);
			if (!current || dirty & /*connectBtnText*/ 4) set_data(t3, /*connectBtnText*/ ctx[2]);
			const modal_changes = {};
			if (dirty & /*connectDialog*/ 2) modal_changes.open = /*connectDialog*/ ctx[1];

			if (dirty & /*$$scope, connectDialog*/ 8194) {
				modal_changes.$$scope = { dirty, ctx };
			}

			modal.$set(modal_changes);
		},
		i(local) {
			if (current) return;
			transition_in(modal.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(modal.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			if (detaching) detach(div3);
			if (detaching) detach(t4);
			destroy_component(modal, detaching);
			mounted = false;
			dispose();
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	const pageTransactionIdLoaded = new Event('pageTransactionIdLoaded');
	const walletConnected = new Event('arweaveWalletConnected');
	const walletDisconnected = new Event('arweaveWalletDisconnected');

	const dispatch = e => {
		window.dispatchEvent(e);
	};

	const arweave = window.Arweave.init({
		host: 'arweave.net',
		port: 443,
		protocol: 'https'
	});

	async function findTransactionId() {
		const owner = document.querySelector('meta[name="author"]').content;

		const query = `
  query {
    transactions(first: 1, 
    owners: ["${owner}"],
    tags: [
      {name: "App-Name", values: ["SmartWeaveContract"]},
      {name: "Type", values: ["PermaWebPage"]},
      {name: "Page-Title", values: ["${document.title}"]}
    ]) {
      edges {
        node {
          id
        }
      }
    }
  }  
    `;

		const { status, data } = await arweave.api.post('graphql', { query });

		if (status === 200) {
			window.transactionId = data.data.transactions.edges[0].node.id;
			$$invalidate(0, transactionId = window.transactionId);
			dispatch(pageTransactionIdLoaded);
		} else {
			window.transactionId = null;
			$$invalidate(0, transactionId = 'not found.');
		}
	}

	onMount(findTransactionId);
	let transactionId = 'Loading...';
	let connectDialog = false;
	let connectBtnText = 'Connect';

	async function handleClick() {
		if (connectBtnText === 'Disconnect') {
			await window.arweaveWallet.disconnect();
			$$invalidate(2, connectBtnText = 'Connect');
			dispatch(walletDisconnected);
			return;
		}

		$$invalidate(1, connectDialog = true);
	}

	async function arConnect() {
		if (!window.arweaveWallet) {
			window.open('https://arconnect.io', '_blank');
		}

		await arweaveWallet.connect(["ACCESS_ADDRESS", "SIGN_TRANSACTION"]);
		dispatch(walletConnected);
		$$invalidate(1, connectDialog = false);
		$$invalidate(2, connectBtnText = 'Disconnect');
	}

	async function walletConnect() {
		const wallet = new ArweaveWebWallet({ name: 'PermaPage: ' + document.title });
		wallet.setUrl('arweave.app');
		await wallet.connect();
		dispatch(walletConnected);
		$$invalidate(1, connectDialog = false);
		$$invalidate(2, connectBtnText = 'Disconnect');
	}

	const click_handler = () => $$invalidate(1, connectDialog = false);

	return [
		transactionId,
		connectDialog,
		connectBtnText,
		handleClick,
		arConnect,
		walletConnect,
		click_handler
	];
}

class Widget extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance, create_fragment, safe_not_equal, {});
	}
}

const el = document.getElementById('widget-connector');
//const dataset = el.dataset

new Widget({
  target: el,
  //props: dataset
});
