/*! GENERATED FILE - do not edit by hand.
 * Source: webui-app.jsx (compiled to ES5 for old-OS wall panels).
 * Rebuild with: node build-webui.js
 */
/**
 * Copyright (c) 2014-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

var runtime = (function (exports) {
  "use strict";

  var Op = Object.prototype;
  var hasOwn = Op.hasOwnProperty;
  var defineProperty = Object.defineProperty || function (obj, key, desc) { obj[key] = desc.value; };
  var undefined; // More compressible than void 0.
  var $Symbol = typeof Symbol === "function" ? Symbol : {};
  var iteratorSymbol = $Symbol.iterator || "@@iterator";
  var asyncIteratorSymbol = $Symbol.asyncIterator || "@@asyncIterator";
  var toStringTagSymbol = $Symbol.toStringTag || "@@toStringTag";

  function define(obj, key, value) {
    Object.defineProperty(obj, key, {
      value: value,
      enumerable: true,
      configurable: true,
      writable: true
    });
    return obj[key];
  }
  try {
    // IE 8 has a broken Object.defineProperty that only works on DOM objects.
    define({}, "");
  } catch (err) {
    define = function(obj, key, value) {
      return obj[key] = value;
    };
  }

  function wrap(innerFn, outerFn, self, tryLocsList) {
    // If outerFn provided and outerFn.prototype is a Generator, then outerFn.prototype instanceof Generator.
    var protoGenerator = outerFn && outerFn.prototype instanceof Generator ? outerFn : Generator;
    var generator = Object.create(protoGenerator.prototype);
    var context = new Context(tryLocsList || []);

    // The ._invoke method unifies the implementations of the .next,
    // .throw, and .return methods.
    defineProperty(generator, "_invoke", { value: makeInvokeMethod(innerFn, self, context) });

    return generator;
  }
  exports.wrap = wrap;

  // Try/catch helper to minimize deoptimizations. Returns a completion
  // record like context.tryEntries[i].completion. This interface could
  // have been (and was previously) designed to take a closure to be
  // invoked without arguments, but in all the cases we care about we
  // already have an existing method we want to call, so there's no need
  // to create a new function object. We can even get away with assuming
  // the method takes exactly one argument, since that happens to be true
  // in every case, so we don't have to touch the arguments object. The
  // only additional allocation required is the completion record, which
  // has a stable shape and so hopefully should be cheap to allocate.
  function tryCatch(fn, obj, arg) {
    try {
      return { type: "normal", arg: fn.call(obj, arg) };
    } catch (err) {
      return { type: "throw", arg: err };
    }
  }

  var GenStateSuspendedStart = "suspendedStart";
  var GenStateSuspendedYield = "suspendedYield";
  var GenStateExecuting = "executing";
  var GenStateCompleted = "completed";

  // Returning this object from the innerFn has the same effect as
  // breaking out of the dispatch switch statement.
  var ContinueSentinel = {};

  // Dummy constructor functions that we use as the .constructor and
  // .constructor.prototype properties for functions that return Generator
  // objects. For full spec compliance, you may wish to configure your
  // minifier not to mangle the names of these two functions.
  function Generator() {}
  function GeneratorFunction() {}
  function GeneratorFunctionPrototype() {}

  // This is a polyfill for %IteratorPrototype% for environments that
  // don't natively support it.
  var IteratorPrototype = {};
  define(IteratorPrototype, iteratorSymbol, function () {
    return this;
  });

  var getProto = Object.getPrototypeOf;
  var NativeIteratorPrototype = getProto && getProto(getProto(values([])));
  if (NativeIteratorPrototype &&
      NativeIteratorPrototype !== Op &&
      hasOwn.call(NativeIteratorPrototype, iteratorSymbol)) {
    // This environment has a native %IteratorPrototype%; use it instead
    // of the polyfill.
    IteratorPrototype = NativeIteratorPrototype;
  }

  var Gp = GeneratorFunctionPrototype.prototype =
    Generator.prototype = Object.create(IteratorPrototype);
  GeneratorFunction.prototype = GeneratorFunctionPrototype;
  defineProperty(Gp, "constructor", { value: GeneratorFunctionPrototype, configurable: true });
  defineProperty(
    GeneratorFunctionPrototype,
    "constructor",
    { value: GeneratorFunction, configurable: true }
  );
  GeneratorFunction.displayName = define(
    GeneratorFunctionPrototype,
    toStringTagSymbol,
    "GeneratorFunction"
  );

  // Helper for defining the .next, .throw, and .return methods of the
  // Iterator interface in terms of a single ._invoke method.
  function defineIteratorMethods(prototype) {
    ["next", "throw", "return"].forEach(function(method) {
      define(prototype, method, function(arg) {
        return this._invoke(method, arg);
      });
    });
  }

  exports.isGeneratorFunction = function(genFun) {
    var ctor = typeof genFun === "function" && genFun.constructor;
    return ctor
      ? ctor === GeneratorFunction ||
        // For the native GeneratorFunction constructor, the best we can
        // do is to check its .name property.
        (ctor.displayName || ctor.name) === "GeneratorFunction"
      : false;
  };

  exports.mark = function(genFun) {
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(genFun, GeneratorFunctionPrototype);
    } else {
      genFun.__proto__ = GeneratorFunctionPrototype;
      define(genFun, toStringTagSymbol, "GeneratorFunction");
    }
    genFun.prototype = Object.create(Gp);
    return genFun;
  };

  // Within the body of any async function, `await x` is transformed to
  // `yield regeneratorRuntime.awrap(x)`, so that the runtime can test
  // `hasOwn.call(value, "__await")` to determine if the yielded value is
  // meant to be awaited.
  exports.awrap = function(arg) {
    return { __await: arg };
  };

  function AsyncIterator(generator, PromiseImpl) {
    function invoke(method, arg, resolve, reject) {
      var record = tryCatch(generator[method], generator, arg);
      if (record.type === "throw") {
        reject(record.arg);
      } else {
        var result = record.arg;
        var value = result.value;
        if (value &&
            typeof value === "object" &&
            hasOwn.call(value, "__await")) {
          return PromiseImpl.resolve(value.__await).then(function(value) {
            invoke("next", value, resolve, reject);
          }, function(err) {
            invoke("throw", err, resolve, reject);
          });
        }

        return PromiseImpl.resolve(value).then(function(unwrapped) {
          // When a yielded Promise is resolved, its final value becomes
          // the .value of the Promise<{value,done}> result for the
          // current iteration.
          result.value = unwrapped;
          resolve(result);
        }, function(error) {
          // If a rejected Promise was yielded, throw the rejection back
          // into the async generator function so it can be handled there.
          return invoke("throw", error, resolve, reject);
        });
      }
    }

    var previousPromise;

    function enqueue(method, arg) {
      function callInvokeWithMethodAndArg() {
        return new PromiseImpl(function(resolve, reject) {
          invoke(method, arg, resolve, reject);
        });
      }

      return previousPromise =
        // If enqueue has been called before, then we want to wait until
        // all previous Promises have been resolved before calling invoke,
        // so that results are always delivered in the correct order. If
        // enqueue has not been called before, then it is important to
        // call invoke immediately, without waiting on a callback to fire,
        // so that the async generator function has the opportunity to do
        // any necessary setup in a predictable way. This predictability
        // is why the Promise constructor synchronously invokes its
        // executor callback, and why async functions synchronously
        // execute code before the first await. Since we implement simple
        // async functions in terms of async generators, it is especially
        // important to get this right, even though it requires care.
        previousPromise ? previousPromise.then(
          callInvokeWithMethodAndArg,
          // Avoid propagating failures to Promises returned by later
          // invocations of the iterator.
          callInvokeWithMethodAndArg
        ) : callInvokeWithMethodAndArg();
    }

    // Define the unified helper method that is used to implement .next,
    // .throw, and .return (see defineIteratorMethods).
    defineProperty(this, "_invoke", { value: enqueue });
  }

  defineIteratorMethods(AsyncIterator.prototype);
  define(AsyncIterator.prototype, asyncIteratorSymbol, function () {
    return this;
  });
  exports.AsyncIterator = AsyncIterator;

  // Note that simple async functions are implemented on top of
  // AsyncIterator objects; they just return a Promise for the value of
  // the final result produced by the iterator.
  exports.async = function(innerFn, outerFn, self, tryLocsList, PromiseImpl) {
    if (PromiseImpl === void 0) PromiseImpl = Promise;

    var iter = new AsyncIterator(
      wrap(innerFn, outerFn, self, tryLocsList),
      PromiseImpl
    );

    return exports.isGeneratorFunction(outerFn)
      ? iter // If outerFn is a generator, return the full iterator.
      : iter.next().then(function(result) {
          return result.done ? result.value : iter.next();
        });
  };

  function makeInvokeMethod(innerFn, self, context) {
    var state = GenStateSuspendedStart;

    return function invoke(method, arg) {
      if (state === GenStateExecuting) {
        throw new Error("Generator is already running");
      }

      if (state === GenStateCompleted) {
        if (method === "throw") {
          throw arg;
        }

        // Be forgiving, per GeneratorResume behavior specified since ES2015:
        // ES2015 spec, step 3: https://262.ecma-international.org/6.0/#sec-generatorresume
        // Latest spec, step 2: https://tc39.es/ecma262/#sec-generatorresume
        return doneResult();
      }

      context.method = method;
      context.arg = arg;

      while (true) {
        var delegate = context.delegate;
        if (delegate) {
          var delegateResult = maybeInvokeDelegate(delegate, context);
          if (delegateResult) {
            if (delegateResult === ContinueSentinel) continue;
            return delegateResult;
          }
        }

        if (context.method === "next") {
          // Setting context._sent for legacy support of Babel's
          // function.sent implementation.
          context.sent = context._sent = context.arg;

        } else if (context.method === "throw") {
          if (state === GenStateSuspendedStart) {
            state = GenStateCompleted;
            throw context.arg;
          }

          context.dispatchException(context.arg);

        } else if (context.method === "return") {
          context.abrupt("return", context.arg);
        }

        state = GenStateExecuting;

        var record = tryCatch(innerFn, self, context);
        if (record.type === "normal") {
          // If an exception is thrown from innerFn, we leave state ===
          // GenStateExecuting and loop back for another invocation.
          state = context.done
            ? GenStateCompleted
            : GenStateSuspendedYield;

          if (record.arg === ContinueSentinel) {
            continue;
          }

          return {
            value: record.arg,
            done: context.done
          };

        } else if (record.type === "throw") {
          state = GenStateCompleted;
          // Dispatch the exception by looping back around to the
          // context.dispatchException(context.arg) call above.
          context.method = "throw";
          context.arg = record.arg;
        }
      }
    };
  }

  // Call delegate.iterator[context.method](context.arg) and handle the
  // result, either by returning a { value, done } result from the
  // delegate iterator, or by modifying context.method and context.arg,
  // setting context.delegate to null, and returning the ContinueSentinel.
  function maybeInvokeDelegate(delegate, context) {
    var methodName = context.method;
    var method = delegate.iterator[methodName];
    if (method === undefined) {
      // A .throw or .return when the delegate iterator has no .throw
      // method, or a missing .next method, always terminate the
      // yield* loop.
      context.delegate = null;

      // Note: ["return"] must be used for ES3 parsing compatibility.
      if (methodName === "throw" && delegate.iterator["return"]) {
        // If the delegate iterator has a return method, give it a
        // chance to clean up.
        context.method = "return";
        context.arg = undefined;
        maybeInvokeDelegate(delegate, context);

        if (context.method === "throw") {
          // If maybeInvokeDelegate(context) changed context.method from
          // "return" to "throw", let that override the TypeError below.
          return ContinueSentinel;
        }
      }
      if (methodName !== "return") {
        context.method = "throw";
        context.arg = new TypeError(
          "The iterator does not provide a '" + methodName + "' method");
      }

      return ContinueSentinel;
    }

    var record = tryCatch(method, delegate.iterator, context.arg);

    if (record.type === "throw") {
      context.method = "throw";
      context.arg = record.arg;
      context.delegate = null;
      return ContinueSentinel;
    }

    var info = record.arg;

    if (! info) {
      context.method = "throw";
      context.arg = new TypeError("iterator result is not an object");
      context.delegate = null;
      return ContinueSentinel;
    }

    if (info.done) {
      // Assign the result of the finished delegate to the temporary
      // variable specified by delegate.resultName (see delegateYield).
      context[delegate.resultName] = info.value;

      // Resume execution at the desired location (see delegateYield).
      context.next = delegate.nextLoc;

      // If context.method was "throw" but the delegate handled the
      // exception, let the outer generator proceed normally. If
      // context.method was "next", forget context.arg since it has been
      // "consumed" by the delegate iterator. If context.method was
      // "return", allow the original .return call to continue in the
      // outer generator.
      if (context.method !== "return") {
        context.method = "next";
        context.arg = undefined;
      }

    } else {
      // Re-yield the result returned by the delegate method.
      return info;
    }

    // The delegate iterator is finished, so forget it and continue with
    // the outer generator.
    context.delegate = null;
    return ContinueSentinel;
  }

  // Define Generator.prototype.{next,throw,return} in terms of the
  // unified ._invoke helper method.
  defineIteratorMethods(Gp);

  define(Gp, toStringTagSymbol, "Generator");

  // A Generator should always return itself as the iterator object when the
  // @@iterator function is called on it. Some browsers' implementations of the
  // iterator prototype chain incorrectly implement this, causing the Generator
  // object to not be returned from this call. This ensures that doesn't happen.
  // See https://github.com/facebook/regenerator/issues/274 for more details.
  define(Gp, iteratorSymbol, function() {
    return this;
  });

  define(Gp, "toString", function() {
    return "[object Generator]";
  });

  function pushTryEntry(locs) {
    var entry = { tryLoc: locs[0] };

    if (1 in locs) {
      entry.catchLoc = locs[1];
    }

    if (2 in locs) {
      entry.finallyLoc = locs[2];
      entry.afterLoc = locs[3];
    }

    this.tryEntries.push(entry);
  }

  function resetTryEntry(entry) {
    var record = entry.completion || {};
    record.type = "normal";
    delete record.arg;
    entry.completion = record;
  }

  function Context(tryLocsList) {
    // The root entry object (effectively a try statement without a catch
    // or a finally block) gives us a place to store values thrown from
    // locations where there is no enclosing try statement.
    this.tryEntries = [{ tryLoc: "root" }];
    tryLocsList.forEach(pushTryEntry, this);
    this.reset(true);
  }

  exports.keys = function(val) {
    var object = Object(val);
    var keys = [];
    for (var key in object) {
      keys.push(key);
    }
    keys.reverse();

    // Rather than returning an object with a next method, we keep
    // things simple and return the next function itself.
    return function next() {
      while (keys.length) {
        var key = keys.pop();
        if (key in object) {
          next.value = key;
          next.done = false;
          return next;
        }
      }

      // To avoid creating an additional object, we just hang the .value
      // and .done properties off the next function object itself. This
      // also ensures that the minifier will not anonymize the function.
      next.done = true;
      return next;
    };
  };

  function values(iterable) {
    if (iterable != null) {
      var iteratorMethod = iterable[iteratorSymbol];
      if (iteratorMethod) {
        return iteratorMethod.call(iterable);
      }

      if (typeof iterable.next === "function") {
        return iterable;
      }

      if (!isNaN(iterable.length)) {
        var i = -1, next = function next() {
          while (++i < iterable.length) {
            if (hasOwn.call(iterable, i)) {
              next.value = iterable[i];
              next.done = false;
              return next;
            }
          }

          next.value = undefined;
          next.done = true;

          return next;
        };

        return next.next = next;
      }
    }

    throw new TypeError(typeof iterable + " is not iterable");
  }
  exports.values = values;

  function doneResult() {
    return { value: undefined, done: true };
  }

  Context.prototype = {
    constructor: Context,

    reset: function(skipTempReset) {
      this.prev = 0;
      this.next = 0;
      // Resetting context._sent for legacy support of Babel's
      // function.sent implementation.
      this.sent = this._sent = undefined;
      this.done = false;
      this.delegate = null;

      this.method = "next";
      this.arg = undefined;

      this.tryEntries.forEach(resetTryEntry);

      if (!skipTempReset) {
        for (var name in this) {
          // Not sure about the optimal order of these conditions:
          if (name.charAt(0) === "t" &&
              hasOwn.call(this, name) &&
              !isNaN(+name.slice(1))) {
            this[name] = undefined;
          }
        }
      }
    },

    stop: function() {
      this.done = true;

      var rootEntry = this.tryEntries[0];
      var rootRecord = rootEntry.completion;
      if (rootRecord.type === "throw") {
        throw rootRecord.arg;
      }

      return this.rval;
    },

    dispatchException: function(exception) {
      if (this.done) {
        throw exception;
      }

      var context = this;
      function handle(loc, caught) {
        record.type = "throw";
        record.arg = exception;
        context.next = loc;

        if (caught) {
          // If the dispatched exception was caught by a catch block,
          // then let that catch block handle the exception normally.
          context.method = "next";
          context.arg = undefined;
        }

        return !! caught;
      }

      for (var i = this.tryEntries.length - 1; i >= 0; --i) {
        var entry = this.tryEntries[i];
        var record = entry.completion;

        if (entry.tryLoc === "root") {
          // Exception thrown outside of any try block that could handle
          // it, so set the completion value of the entire function to
          // throw the exception.
          return handle("end");
        }

        if (entry.tryLoc <= this.prev) {
          var hasCatch = hasOwn.call(entry, "catchLoc");
          var hasFinally = hasOwn.call(entry, "finallyLoc");

          if (hasCatch && hasFinally) {
            if (this.prev < entry.catchLoc) {
              return handle(entry.catchLoc, true);
            } else if (this.prev < entry.finallyLoc) {
              return handle(entry.finallyLoc);
            }

          } else if (hasCatch) {
            if (this.prev < entry.catchLoc) {
              return handle(entry.catchLoc, true);
            }

          } else if (hasFinally) {
            if (this.prev < entry.finallyLoc) {
              return handle(entry.finallyLoc);
            }

          } else {
            throw new Error("try statement without catch or finally");
          }
        }
      }
    },

    abrupt: function(type, arg) {
      for (var i = this.tryEntries.length - 1; i >= 0; --i) {
        var entry = this.tryEntries[i];
        if (entry.tryLoc <= this.prev &&
            hasOwn.call(entry, "finallyLoc") &&
            this.prev < entry.finallyLoc) {
          var finallyEntry = entry;
          break;
        }
      }

      if (finallyEntry &&
          (type === "break" ||
           type === "continue") &&
          finallyEntry.tryLoc <= arg &&
          arg <= finallyEntry.finallyLoc) {
        // Ignore the finally entry if control is not jumping to a
        // location outside the try/catch block.
        finallyEntry = null;
      }

      var record = finallyEntry ? finallyEntry.completion : {};
      record.type = type;
      record.arg = arg;

      if (finallyEntry) {
        this.method = "next";
        this.next = finallyEntry.finallyLoc;
        return ContinueSentinel;
      }

      return this.complete(record);
    },

    complete: function(record, afterLoc) {
      if (record.type === "throw") {
        throw record.arg;
      }

      if (record.type === "break" ||
          record.type === "continue") {
        this.next = record.arg;
      } else if (record.type === "return") {
        this.rval = this.arg = record.arg;
        this.method = "return";
        this.next = "end";
      } else if (record.type === "normal" && afterLoc) {
        this.next = afterLoc;
      }

      return ContinueSentinel;
    },

    finish: function(finallyLoc) {
      for (var i = this.tryEntries.length - 1; i >= 0; --i) {
        var entry = this.tryEntries[i];
        if (entry.finallyLoc === finallyLoc) {
          this.complete(entry.completion, entry.afterLoc);
          resetTryEntry(entry);
          return ContinueSentinel;
        }
      }
    },

    "catch": function(tryLoc) {
      for (var i = this.tryEntries.length - 1; i >= 0; --i) {
        var entry = this.tryEntries[i];
        if (entry.tryLoc === tryLoc) {
          var record = entry.completion;
          if (record.type === "throw") {
            var thrown = record.arg;
            resetTryEntry(entry);
          }
          return thrown;
        }
      }

      // The context.catch method must only be called with a location
      // argument that corresponds to a known catch block.
      throw new Error("illegal catch attempt");
    },

    delegateYield: function(iterable, resultName, nextLoc) {
      this.delegate = {
        iterator: values(iterable),
        resultName: resultName,
        nextLoc: nextLoc
      };

      if (this.method === "next") {
        // Deliberately forget the last sent value so that we don't
        // accidentally pass it on to the delegate.
        this.arg = undefined;
      }

      return ContinueSentinel;
    }
  };

  // Regardless of whether this script is executing as a CommonJS module
  // or not, return the runtime object so that we can declare the variable
  // regeneratorRuntime in the outer scope, which allows this module to be
  // injected easily by `bin/regenerator --include-runtime script.js`.
  return exports;

}(
  // If this script is executing as a CommonJS module, use module.exports
  // as the regeneratorRuntime namespace. Otherwise create a new empty
  // object. Either way, the resulting object will be used to initialize
  // the regeneratorRuntime variable at the top of this file.
  typeof module === "object" ? module.exports : {}
));

try {
  regeneratorRuntime = runtime;
} catch (accidentalStrictMode) {
  // This module should not be running in strict mode, so the above
  // assignment should always work unless something is misconfigured. Just
  // in case runtime.js accidentally runs in strict mode, in modern engines
  // we can explicitly access globalThis. In older engines we can escape
  // strict mode using a global Function call. This could conceivably fail
  // if a Content Security Policy forbids using Function, but in that case
  // the proper solution is to fix the accidental strict mode problem. If
  // you've misconfigured your bundler to force strict mode and applied a
  // CSP to forbid Function, and you're not willing to fix either of those
  // problems, please detail your unique predicament in a GitHub issue.
  if (typeof globalThis === "object") {
    globalThis.regeneratorRuntime = runtime;
  } else {
    Function("r", "regeneratorRuntime = r")(runtime);
  }
}

function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == _typeof(i) ? i : i + ""; }
function _toPrimitive(t, e) { if ("object" != _typeof(t) || !t) return t; var r; if ("undefined" != typeof Symbol && void 0 !== (r = t[Symbol.toPrimitive])) { var i = r.call(t, e || "default"); if ("object" != _typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === e ? String : Number)(t); }
function _toConsumableArray(r) { return _arrayWithoutHoles(r) || _iterableToArray(r) || _unsupportedIterableToArray(r) || _nonIterableSpread(); }
function _nonIterableSpread() { throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _iterableToArray(r) { if ("undefined" != typeof Symbol && null != r[Symbol.iterator] || null != r["@@iterator"]) return Array.from(r); }
function _arrayWithoutHoles(r) { if (Array.isArray(r)) return _arrayLikeToArray(r); }
function _slicedToArray(r, e) { return _arrayWithHoles(r) || _iterableToArrayLimit(r, e) || _unsupportedIterableToArray(r, e) || _nonIterableRest(); }
function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _unsupportedIterableToArray(r, a) { if (r) { if ("string" == typeof r) return _arrayLikeToArray(r, a); var t = {}.toString.call(r).slice(8, -1); return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0; } }
function _arrayLikeToArray(r, a) { (null == a || a > r.length) && (a = r.length); for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e]; return n; }
function _iterableToArrayLimit(r, l) { var t = null == r ? null : "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"]; if (null != t) { var e, n, i, u, a = [], f = !0, o = !1; try { if (i = (t = t.call(r)).next, 0 === l) { if (Object(t) !== t) return; f = !1; } else for (; !(f = (e = i.call(t)).done) && (a.push(e.value), a.length !== l); f = !0); } catch (r) { o = !0, n = r; } finally { try { if (!f && null != t["return"] && (u = t["return"](), Object(u) !== u)) return; } finally { if (o) throw n; } } return a; } }
function _arrayWithHoles(r) { if (Array.isArray(r)) return r; }
function _regenerator() { var e, t, r = "function" == typeof Symbol ? Symbol : {}, n = r.iterator || "@@iterator", o = r.toStringTag || "@@toStringTag"; function i(r, n, o, i) { var c = n && n.prototype instanceof Generator ? n : Generator, u = Object.create(c.prototype); return _regeneratorDefine2(u, "_invoke", function (r, n, o) { var i, c, u, f = 0, p = o || [], y = !1, G = { p: 0, n: 0, v: e, a: d, f: d.bind(e, 4), d: function d(t, r) { return i = t, c = 0, u = e, G.n = r, a; } }; function d(r, n) { for (c = r, u = n, t = 0; !y && f && !o && t < p.length; t++) { var o, i = p[t], d = G.p, l = i[2]; r > 3 ? (o = l === n) && (u = i[(c = i[4]) ? 5 : (c = 3, 3)], i[4] = i[5] = e) : i[0] <= d && ((o = r < 2 && d < i[1]) ? (c = 0, G.v = n, G.n = i[1]) : d < l && (o = r < 3 || i[0] > n || n > l) && (i[4] = r, i[5] = n, G.n = l, c = 0)); } if (o || r > 1) return a; throw y = !0, n; } return function (o, p, l) { if (f > 1) throw TypeError("Generator is already running"); for (y && 1 === p && d(p, l), c = p, u = l; (t = c < 2 ? e : u) || !y;) { i || (c ? c < 3 ? (c > 1 && (G.n = -1), d(c, u)) : G.n = u : G.v = u); try { if (f = 2, i) { if (c || (o = "next"), t = i[o]) { if (!(t = t.call(i, u))) throw TypeError("iterator result is not an object"); if (!t.done) return t; u = t.value, c < 2 && (c = 0); } else 1 === c && (t = i["return"]) && t.call(i), c < 2 && (u = TypeError("The iterator does not provide a '" + o + "' method"), c = 1); i = e; } else if ((t = (y = G.n < 0) ? u : r.call(n, G)) !== a) break; } catch (t) { i = e, c = 1, u = t; } finally { f = 1; } } return { value: t, done: y }; }; }(r, o, i), !0), u; } var a = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} t = Object.getPrototypeOf; var c = [][n] ? t(t([][n]())) : (_regeneratorDefine2(t = {}, n, function () { return this; }), t), u = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(c); function f(e) { return Object.setPrototypeOf ? Object.setPrototypeOf(e, GeneratorFunctionPrototype) : (e.__proto__ = GeneratorFunctionPrototype, _regeneratorDefine2(e, o, "GeneratorFunction")), e.prototype = Object.create(u), e; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, _regeneratorDefine2(u, "constructor", GeneratorFunctionPrototype), _regeneratorDefine2(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = "GeneratorFunction", _regeneratorDefine2(GeneratorFunctionPrototype, o, "GeneratorFunction"), _regeneratorDefine2(u), _regeneratorDefine2(u, o, "Generator"), _regeneratorDefine2(u, n, function () { return this; }), _regeneratorDefine2(u, "toString", function () { return "[object Generator]"; }), (_regenerator = function _regenerator() { return { w: i, m: f }; })(); }
function _regeneratorDefine2(e, r, n, t) { var i = Object.defineProperty; try { i({}, "", {}); } catch (e) { i = 0; } _regeneratorDefine2 = function _regeneratorDefine(e, r, n, t) { function o(r, n) { _regeneratorDefine2(e, r, function (e) { return this._invoke(r, n, e); }); } r ? i ? i(e, r, { value: n, enumerable: !t, configurable: !t, writable: !t }) : e[r] = n : (o("next", 0), o("throw", 1), o("return", 2)); }, _regeneratorDefine2(e, r, n, t); }
function asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function _asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
var _React = React,
  useState = _React.useState,
  useEffect = _React.useEffect,
  useRef = _React.useRef;
var API = {
  loadConfig: function loadConfig() {
    return _asyncToGenerator(_regenerator().m(function _callee() {
      var response, _t;
      return _regenerator().w(function (_context) {
        while (1) switch (_context.p = _context.n) {
          case 0:
            _context.p = 0;
            _context.n = 1;
            return fetch('/api/config');
          case 1:
            response = _context.v;
            _context.n = 2;
            return response.json();
          case 2:
            return _context.a(2, _context.v);
          case 3:
            _context.p = 3;
            _t = _context.v;
            console.error('Error loading config:', _t);
            return _context.a(2, {
              areas: {}
            });
        }
      }, _callee, null, [[0, 3]]);
    }))();
  },
  saveHouseMap: function saveHouseMap(map) {
    return _asyncToGenerator(_regenerator().m(function _callee2() {
      var response, _t2;
      return _regenerator().w(function (_context2) {
        while (1) switch (_context2.p = _context2.n) {
          case 0:
            _context2.p = 0;
            _context2.n = 1;
            return fetch('/api/house-map', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(map)
            });
          case 1:
            response = _context2.v;
            _context2.n = 2;
            return response.json();
          case 2:
            return _context2.a(2, _context2.v);
          case 3:
            _context2.p = 3;
            _t2 = _context2.v;
            console.error('Error saving house map:', _t2);
            localStorage.setItem('houseMap', JSON.stringify(map));
            return _context2.a(2, {
              success: true,
              message: 'Saved locally'
            });
        }
      }, _callee2, null, [[0, 3]]);
    }))();
  },
  loadHouseMap: function loadHouseMap() {
    return _asyncToGenerator(_regenerator().m(function _callee3() {
      var response, local, _t3;
      return _regenerator().w(function (_context3) {
        while (1) switch (_context3.p = _context3.n) {
          case 0:
            _context3.p = 0;
            _context3.n = 1;
            return fetch('/api/house-map');
          case 1:
            response = _context3.v;
            _context3.n = 2;
            return response.json();
          case 2:
            return _context3.a(2, _context3.v);
          case 3:
            _context3.p = 3;
            _t3 = _context3.v;
            local = localStorage.getItem('houseMap');
            return _context3.a(2, local ? JSON.parse(local) : null);
        }
      }, _callee3, null, [[0, 3]]);
    }))();
  },
  saveRoomConfig: function saveRoomConfig(roomId, config) {
    return _asyncToGenerator(_regenerator().m(function _callee4() {
      var response, _t4;
      return _regenerator().w(function (_context4) {
        while (1) switch (_context4.p = _context4.n) {
          case 0:
            _context4.p = 0;
            _context4.n = 1;
            return fetch("/api/room/".concat(roomId), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(config)
            });
          case 1:
            response = _context4.v;
            _context4.n = 2;
            return response.json();
          case 2:
            return _context4.a(2, _context4.v);
          case 3:
            _context4.p = 3;
            _t4 = _context4.v;
            console.error('Error saving room config:', _t4);
            localStorage.setItem("room_".concat(roomId), JSON.stringify(config));
            return _context4.a(2, {
              success: true
            });
        }
      }, _callee4, null, [[0, 3]]);
    }))();
  },
  loadRoomConfig: function loadRoomConfig(roomId) {
    return _asyncToGenerator(_regenerator().m(function _callee5() {
      var response, local, _t5;
      return _regenerator().w(function (_context5) {
        while (1) switch (_context5.p = _context5.n) {
          case 0:
            _context5.p = 0;
            _context5.n = 1;
            return fetch("/api/room/".concat(roomId));
          case 1:
            response = _context5.v;
            _context5.n = 2;
            return response.json();
          case 2:
            return _context5.a(2, _context5.v);
          case 3:
            _context5.p = 3;
            _t5 = _context5.v;
            local = localStorage.getItem("room_".concat(roomId));
            return _context5.a(2, local ? JSON.parse(local) : {
              lights: [],
              furniture: []
            });
        }
      }, _callee5, null, [[0, 3]]);
    }))();
  },
  toggleLight: function toggleLight(code, state) {
    return _asyncToGenerator(_regenerator().m(function _callee6() {
      var response, _t6;
      return _regenerator().w(function (_context6) {
        while (1) switch (_context6.p = _context6.n) {
          case 0:
            _context6.p = 0;
            _context6.n = 1;
            return fetch('/api/light/toggle', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                code: code,
                state: state
              })
            });
          case 1:
            response = _context6.v;
            _context6.n = 2;
            return response.json();
          case 2:
            return _context6.a(2, _context6.v);
          case 3:
            _context6.p = 3;
            _t6 = _context6.v;
            console.error('Error toggling light:', _t6);
            return _context6.a(2, {
              success: false
            });
        }
      }, _callee6, null, [[0, 3]]);
    }))();
  },
  streamStates: function streamStates(_ref) {
    var onStates = _ref.onStates,
      onStatus = _ref.onStatus;
    var source = new EventSource('/api/states/stream');
    source.addEventListener('states', function (event) {
      var snapshot = JSON.parse(event.data);
      var states = {};
      Object.keys(snapshot.codes || {}).forEach(function (code) {
        states[code] = snapshot.codes[code] === 'ON';
      });
      onStates(states, snapshot);
    });
    source.onopen = function () {
      return onStatus && onStatus(true);
    };
    source.onerror = function () {
      return onStatus && onStatus(false);
    };
    return source;
  }
};
function Furniture(_ref2) {
  var furniture = _ref2.furniture,
    editMode = _ref2.editMode,
    selected = _ref2.selected,
    onPositionChange = _ref2.onPositionChange,
    onRotate = _ref2.onRotate,
    onDelete = _ref2.onDelete,
    onClick = _ref2.onClick,
    onLabelChange = _ref2.onLabelChange;
  var _useState = useState(false),
    _useState2 = _slicedToArray(_useState, 2),
    isDragging = _useState2[0],
    setIsDragging = _useState2[1];
  var _useState3 = useState(false),
    _useState4 = _slicedToArray(_useState3, 2),
    isResizing = _useState4[0],
    setIsResizing = _useState4[1];
  var _useState5 = useState(''),
    _useState6 = _slicedToArray(_useState5, 2),
    editingLabel = _useState6[0],
    setEditingLabel = _useState6[1];
  var dragStart = useRef({
    x: 0,
    y: 0,
    furnitureX: 0,
    furnitureY: 0
  });
  var inputRef = useRef(null);
  useEffect(function () {
    if (selected && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [selected]);
  var handleMouseDown = function handleMouseDown(e) {
    if (!editMode) return;
    e.stopPropagation();
    onClick(furniture.id);
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      furnitureX: furniture.x,
      furnitureY: furniture.y
    };
  };
  var handleResizeStart = function handleResizeStart(e) {
    if (!editMode) return;
    e.stopPropagation();
    setIsResizing(true);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      width: furniture.width,
      height: furniture.height
    };
  };
  useEffect(function () {
    var handleMouseMove = function handleMouseMove(e) {
      if (isDragging) {
        var deltaX = e.clientX - dragStart.current.x;
        var deltaY = e.clientY - dragStart.current.y;
        var newX = Math.round((dragStart.current.furnitureX + deltaX) / 15) * 15;
        var newY = Math.round((dragStart.current.furnitureY + deltaY) / 15) * 15;
        onPositionChange(furniture.id, {
          x: newX,
          y: newY
        });
      } else if (isResizing) {
        var _deltaX = e.clientX - dragStart.current.x;
        var _deltaY = e.clientY - dragStart.current.y;
        var newWidth = Math.max(30, Math.round((dragStart.current.width + _deltaX) / 15) * 15);
        var newHeight = Math.max(30, Math.round((dragStart.current.height + _deltaY) / 15) * 15);
        onPositionChange(furniture.id, {
          width: newWidth,
          height: newHeight
        });
      }
    };
    var handleMouseUp = function handleMouseUp() {
      setIsDragging(false);
      setIsResizing(false);
    };
    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return function () {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, isResizing]);
  var handleLabelSubmit = function handleLabelSubmit() {
    if (editingLabel !== furniture.label) {
      onLabelChange(furniture.id, editingLabel);
    }
  };
  var handleKeyDown = function handleKeyDown(e) {
    if (e.key === 'Enter') {
      handleLabelSubmit();
      inputRef.current.blur();
    } else if (e.key === 'Escape') {
      setEditingLabel(furniture.label || '');
      inputRef.current.blur();
    }
  };
  return React.createElement("div", {
    className: "furniture-box ".concat(selected ? 'selected' : ''),
    style: {
      left: furniture.x,
      top: furniture.y,
      width: furniture.width,
      height: furniture.height
    },
    onMouseDown: handleMouseDown
  }, selected && editMode && React.createElement("div", {
    className: "furniture-label-editor"
  }, React.createElement("input", {
    ref: inputRef,
    type: "text",
    className: "furniture-label-input",
    value: editingLabel !== '' ? editingLabel : furniture.label || '',
    onChange: function onChange(e) {
      return setEditingLabel(e.target.value);
    },
    onBlur: handleLabelSubmit,
    onKeyDown: handleKeyDown,
    placeholder: "Enter label...",
    onClick: function onClick(e) {
      return e.stopPropagation();
    }
  })), React.createElement("span", {
    className: "furniture-label ".concat(furniture.rotated ? 'rotated' : '')
  }, furniture.label || ''), editMode && React.createElement(React.Fragment, null, React.createElement("div", {
    className: "furniture-controls"
  }, React.createElement("button", {
    className: "furniture-btn",
    onClick: function onClick(e) {
      e.stopPropagation();
      onRotate(furniture.id);
    },
    title: "Rotate label"
  }, "\u21BB"), React.createElement("button", {
    className: "furniture-btn delete",
    onClick: function onClick(e) {
      e.stopPropagation();
      onDelete(furniture.id);
    },
    title: "Delete"
  }, "\xD7")), React.createElement("div", {
    className: "resize-handle",
    onMouseDown: handleResizeStart
  })));
}
function Room(_ref3) {
  var room = _ref3.room,
    onSelect = _ref3.onSelect,
    isSelected = _ref3.isSelected,
    editMode = _ref3.editMode,
    onPositionChange = _ref3.onPositionChange;
  var _useState7 = useState(false),
    _useState8 = _slicedToArray(_useState7, 2),
    isDragging = _useState8[0],
    setIsDragging = _useState8[1];
  var _useState9 = useState(false),
    _useState0 = _slicedToArray(_useState9, 2),
    isResizing = _useState0[0],
    setIsResizing = _useState0[1];
  var dragStart = useRef({
    x: 0,
    y: 0,
    roomX: 0,
    roomY: 0
  });
  var handleMouseDown = function handleMouseDown(e) {
    if (!editMode) {
      onSelect(room.id);
      return;
    }
    e.stopPropagation();
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      roomX: room.x,
      roomY: room.y
    };
  };
  var handleResizeStart = function handleResizeStart(e) {
    if (!editMode) return;
    e.stopPropagation();
    setIsResizing(true);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      width: room.width,
      height: room.height
    };
  };
  useEffect(function () {
    var handleMouseMove = function handleMouseMove(e) {
      if (isDragging) {
        var deltaX = e.clientX - dragStart.current.x;
        var deltaY = e.clientY - dragStart.current.y;
        var newX = Math.round((dragStart.current.roomX + deltaX) / 20) * 20;
        var newY = Math.round((dragStart.current.roomY + deltaY) / 20) * 20;
        onPositionChange(room.id, {
          x: newX,
          y: newY
        });
      } else if (isResizing) {
        var _deltaX2 = e.clientX - dragStart.current.x;
        var _deltaY2 = e.clientY - dragStart.current.y;
        var newWidth = Math.max(100, Math.round((dragStart.current.width + _deltaX2) / 20) * 20);
        var newHeight = Math.max(100, Math.round((dragStart.current.height + _deltaY2) / 20) * 20);
        onPositionChange(room.id, {
          width: newWidth,
          height: newHeight
        });
      }
    };
    var handleMouseUp = function handleMouseUp() {
      setIsDragging(false);
      setIsResizing(false);
    };
    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return function () {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, isResizing]);
  return React.createElement("div", {
    className: "room-box ".concat(isSelected ? 'selected' : ''),
    style: {
      left: room.x,
      top: room.y,
      width: room.width,
      height: room.height
    },
    onMouseDown: handleMouseDown
  }, room.name, editMode && React.createElement("div", {
    className: "resize-handle",
    onMouseDown: handleResizeStart
  }));
}
function Light(_ref4) {
  var light = _ref4.light,
    state = _ref4.state,
    tracked = _ref4.tracked,
    onToggle = _ref4.onToggle,
    onPositionChange = _ref4.onPositionChange,
    onRemove = _ref4.onRemove,
    editMode = _ref4.editMode;
  var _useState1 = useState(false),
    _useState10 = _slicedToArray(_useState1, 2),
    isDragging = _useState10[0],
    setIsDragging = _useState10[1];
  var dragStart = useRef({
    x: 0,
    y: 0,
    lightX: 0,
    lightY: 0
  });
  var handleMouseDown = function handleMouseDown(e) {
    if (!editMode) {
      onToggle(light.id);
      return;
    }
    e.stopPropagation();
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      lightX: light.x,
      lightY: light.y
    };
  };
  var handleRemoveClick = function handleRemoveClick(e) {
    e.stopPropagation();
    onRemove(light.id);
  };
  useEffect(function () {
    var handleMouseMove = function handleMouseMove(e) {
      if (isDragging) {
        var deltaX = e.clientX - dragStart.current.x;
        var deltaY = e.clientY - dragStart.current.y;
        var newX = Math.round((dragStart.current.lightX + deltaX) / 15) * 15;
        var newY = Math.round((dragStart.current.lightY + deltaY) / 15) * 15;
        onPositionChange(light.id, {
          x: newX,
          y: newY
        });
      }
    };
    var handleMouseUp = function handleMouseUp() {
      setIsDragging(false);
    };
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return function () {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging]);
  return React.createElement("div", {
    className: "light-bulb ".concat(state ? 'on' : 'off', " ").concat(tracked ? '' : 'untracked'),
    style: {
      left: light.x,
      top: light.y
    },
    onMouseDown: handleMouseDown,
    title: tracked ? light.name : "".concat(light.name, " (no live state: RF-only device)")
  }, React.createElement("div", {
    className: "light-circle"
  }), React.createElement("span", {
    className: "light-icon"
  }, "\uD83D\uDCA1"), editMode && React.createElement("button", {
    className: "light-delete-btn",
    onClick: handleRemoveClick,
    title: "Remove light"
  }, "\xD7"), React.createElement("div", {
    className: "light-label"
  }, light.name.split('-')[0]));
}
function RoomEditor(_ref5) {
  var room = _ref5.room,
    onClose = _ref5.onClose,
    availableLights = _ref5.availableLights,
    onSave = _ref5.onSave,
    liveStates = _ref5.liveStates;
  var _useState11 = useState(false),
    _useState12 = _slicedToArray(_useState11, 2),
    editMode = _useState12[0],
    setEditMode = _useState12[1];
  var _useState13 = useState('OPERATIVO'),
    _useState14 = _slicedToArray(_useState13, 2),
    operatingMode = _useState14[0],
    setOperatingMode = _useState14[1];
  var _useState15 = useState(room.lights || []),
    _useState16 = _slicedToArray(_useState15, 2),
    lights = _useState16[0],
    setLights = _useState16[1];
  var _useState17 = useState(room.furniture || []),
    _useState18 = _slicedToArray(_useState17, 2),
    furniture = _useState18[0],
    setFurniture = _useState18[1];
  var _useState19 = useState(null),
    _useState20 = _slicedToArray(_useState19, 2),
    selectedFurniture = _useState20[0],
    setSelectedFurniture = _useState20[1];
  var _useState21 = useState(new Set((room.lights || []).map(function (l) {
      return l.lightId || l.code;
    }))),
    _useState22 = _slicedToArray(_useState21, 2),
    placedLightIds = _useState22[0],
    setPlacedLightIds = _useState22[1];
  var canvasRef = useRef(null);
  var wrapperRef = useRef(null);
  var isTracked = function isTracked(light) {
    return Object.prototype.hasOwnProperty.call(liveStates, light.code);
  };
  var liveStateFor = function liveStateFor(light) {
    return operatingMode === 'OPERATIVO' && isTracked(light) ? liveStates[light.code] : light.state;
  };
  useEffect(function () {
    if (!editMode && canvasRef.current && wrapperRef.current) {
      var wrapper = wrapperRef.current;
      var canvas = canvasRef.current;
      var minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      [].concat(_toConsumableArray(furniture), _toConsumableArray(lights)).forEach(function (item) {
        minX = Math.min(minX, item.x);
        minY = Math.min(minY, item.y);
        maxX = Math.max(maxX, item.x + (item.width || 50));
        maxY = Math.max(maxY, item.y + (item.height || 50));
      });
      if (minX === Infinity) {
        minX = 0;
        minY = 0;
        maxX = 800;
        maxY = 600;
      }
      var contentWidth = maxX - minX + 100;
      var contentHeight = maxY - minY + 100;
      var wrapperWidth = wrapper.clientWidth;
      var wrapperHeight = wrapper.clientHeight;
      var scaleX = wrapperWidth / contentWidth;
      var scaleY = wrapperHeight / contentHeight;
      var scale = Math.min(scaleX, scaleY, 1);
      canvas.style.transform = "scale(".concat(scale, ")");
      canvas.style.width = "".concat(contentWidth, "px");
      canvas.style.height = "".concat(contentHeight, "px");
      canvas.style.transformOrigin = 'center center';
    } else if (editMode && canvasRef.current) {
      canvasRef.current.style.transform = 'scale(1)';
      canvasRef.current.style.width = '100%';
      canvasRef.current.style.height = '100%';
      canvasRef.current.style.minWidth = '1200px';
      canvasRef.current.style.minHeight = '800px';
    }
  }, [editMode, furniture, lights]);
  var handleCanvasClick = function handleCanvasClick() {
    setSelectedFurniture(null);
  };
  var handleDragOver = function handleDragOver(e) {
    if (!editMode) return;
    e.preventDefault();
  };
  var handleDrop = function handleDrop(e) {
    if (!editMode) return;
    e.preventDefault();
    var data = e.dataTransfer.getData('application/json');
    if (!data) return;
    var dropData = JSON.parse(data);
    var rect = canvasRef.current.getBoundingClientRect();
    var x = Math.round((e.clientX - rect.left) / 15) * 15;
    var y = Math.round((e.clientY - rect.top) / 15) * 15;
    if (dropData.type === 'light') {
      if (placedLightIds.has(dropData.code)) return;
      var newLight = {
        id: Date.now() + Math.random(),
        lightId: dropData.code,
        name: dropData.name,
        code: dropData.code,
        x: x,
        y: y,
        state: false
      };
      setLights([].concat(_toConsumableArray(lights), [newLight]));
      setPlacedLightIds(new Set([].concat(_toConsumableArray(placedLightIds), [dropData.code])));
    } else if (dropData.type === 'furniture') {
      var newFurniture = {
        id: Date.now() + Math.random(),
        label: '',
        x: x,
        y: y,
        width: 90,
        height: 60,
        rotated: false
      };
      setFurniture([].concat(_toConsumableArray(furniture), [newFurniture]));
      setSelectedFurniture(newFurniture.id);
    }
  };
  var handleLightPositionChange = function handleLightPositionChange(lightId, position) {
    setLights(lights.map(function (l) {
      return l.id === lightId ? _objectSpread(_objectSpread({}, l), position) : l;
    }));
  };
  var handleLightRemove = function handleLightRemove(lightId) {
    var light = lights.find(function (l) {
      return l.id === lightId;
    });
    if (light) {
      setLights(lights.filter(function (l) {
        return l.id !== lightId;
      }));
      setPlacedLightIds(function (prev) {
        var newSet = new Set(prev);
        newSet["delete"](light.lightId || light.code);
        return newSet;
      });
    }
  };
  var handleFurniturePositionChange = function handleFurniturePositionChange(furnitureId, changes) {
    setFurniture(furniture.map(function (f) {
      return f.id === furnitureId ? _objectSpread(_objectSpread({}, f), changes) : f;
    }));
  };
  var handleFurnitureRotate = function handleFurnitureRotate(furnitureId) {
    setFurniture(furniture.map(function (f) {
      return f.id === furnitureId ? _objectSpread(_objectSpread({}, f), {}, {
        rotated: !f.rotated
      }) : f;
    }));
  };
  var handleFurnitureDelete = function handleFurnitureDelete(furnitureId) {
    setFurniture(furniture.filter(function (f) {
      return f.id !== furnitureId;
    }));
    if (selectedFurniture === furnitureId) {
      setSelectedFurniture(null);
    }
  };
  var handleFurnitureLabelChange = function handleFurnitureLabelChange(furnitureId, label) {
    setFurniture(furniture.map(function (f) {
      return f.id === furnitureId ? _objectSpread(_objectSpread({}, f), {}, {
        label: label
      }) : f;
    }));
  };
  var handleToggleLight = function () {
    var _handleToggleLight = _asyncToGenerator(_regenerator().m(function _callee7(lightId) {
      var light, next, result, _t7;
      return _regenerator().w(function (_context7) {
        while (1) switch (_context7.p = _context7.n) {
          case 0:
            light = lights.find(function (l) {
              return l.id === lightId;
            });
            if (light) {
              _context7.n = 1;
              break;
            }
            return _context7.a(2);
          case 1:
            next = !liveStateFor(light);
            if (!(operatingMode === 'OPERATIVO')) {
              _context7.n = 4;
              break;
            }
            _context7.n = 2;
            return API.toggleLight(light.code, next ? 'ON' : 'OFF');
          case 2:
            result = _context7.v;
            if (!(result.success === false)) {
              _context7.n = 3;
              break;
            }
            return _context7.a(2);
          case 3:
            _context7.n = 8;
            break;
          case 4:
            if (!(operatingMode === 'CORREGGI' && isTracked(light))) {
              _context7.n = 8;
              break;
            }
            _context7.p = 5;
            _context7.n = 6;
            return fetch('/api/state/update', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                code: light.code,
                state: next ? 'ON' : 'OFF'
              })
            });
          case 6:
            _context7.n = 8;
            break;
          case 7:
            _context7.p = 7;
            _t7 = _context7.v;
          case 8:
            setLights(lights.map(function (l) {
              return l.id === lightId ? _objectSpread(_objectSpread({}, l), {}, {
                state: next
              }) : l;
            }));
          case 9:
            return _context7.a(2);
        }
      }, _callee7, null, [[5, 7]]);
    }));
    function handleToggleLight(_x) {
      return _handleToggleLight.apply(this, arguments);
    }
    return handleToggleLight;
  }();
  var handleSave = function () {
    var _handleSave = _asyncToGenerator(_regenerator().m(function _callee8() {
      return _regenerator().w(function (_context8) {
        while (1) switch (_context8.n) {
          case 0:
            _context8.n = 1;
            return API.saveRoomConfig(room.id, {
              lights: lights,
              furniture: furniture
            });
          case 1:
            onSave(room.id, lights, furniture);
            setEditMode(false);
            alert('Room configuration saved to map-conf.json!');
          case 2:
            return _context8.a(2);
        }
      }, _callee8);
    }));
    function handleSave() {
      return _handleSave.apply(this, arguments);
    }
    return handleSave;
  }();
  var unplacedLights = availableLights.filter(function (l) {
    return !placedLightIds.has(l.code);
  });
  return React.createElement("div", {
    className: "modal-overlay"
  }, React.createElement("div", {
    className: "modal"
  }, React.createElement("div", {
    className: "modal-header"
  }, React.createElement("div", {
    className: "modal-header-left"
  }, React.createElement("h2", null, room.name), React.createElement("button", {
    className: "btn compact ".concat(editMode ? 'success' : 'secondary'),
    onClick: function onClick() {
      return setEditMode(!editMode);
    }
  }, editMode ? 'Edit Mode' : 'View Mode'), !editMode && React.createElement("button", {
    className: "btn compact ".concat(operatingMode === 'OPERATIVO' ? 'operativo' : 'correggi'),
    onClick: function onClick() {
      return setOperatingMode(operatingMode === 'OPERATIVO' ? 'CORREGGI' : 'OPERATIVO');
    }
  }, operatingMode), editMode && React.createElement("button", {
    className: "btn compact success",
    onClick: handleSave
  }, "Save")), React.createElement("div", {
    className: "modal-header-right"
  }, React.createElement("div", {
    className: "mode-indicator"
  }, editMode ? '✏️ Editing' : operatingMode === 'OPERATIVO' ? '🟢 Operating' : '🔴 Adjusting'), React.createElement("button", {
    className: "modal-close",
    onClick: onClose
  }, "\xD7"))), React.createElement("div", {
    className: "modal-body"
  }, React.createElement("div", {
    ref: wrapperRef,
    className: "room-canvas-wrapper",
    style: {
      overflow: editMode ? 'auto' : 'hidden',
      width: '100%'
    }
  }, React.createElement("div", {
    ref: canvasRef,
    className: "room-canvas",
    onDragOver: handleDragOver,
    onDrop: handleDrop,
    onClick: handleCanvasClick,
    style: {
      width: editMode ? '100%' : 'auto',
      height: editMode ? '100%' : 'auto',
      minWidth: editMode ? '1200px' : '0',
      minHeight: editMode ? '800px' : '0'
    }
  }, furniture.map(function (f) {
    return React.createElement(Furniture, {
      key: f.id,
      furniture: f,
      editMode: editMode,
      selected: selectedFurniture === f.id,
      onPositionChange: handleFurniturePositionChange,
      onRotate: handleFurnitureRotate,
      onDelete: handleFurnitureDelete,
      onClick: setSelectedFurniture,
      onLabelChange: handleFurnitureLabelChange
    });
  }), lights.map(function (light) {
    return React.createElement(Light, {
      key: light.id,
      light: light,
      state: liveStateFor(light),
      tracked: isTracked(light),
      onToggle: handleToggleLight,
      onPositionChange: handleLightPositionChange,
      onRemove: handleLightRemove,
      editMode: editMode
    });
  }))), editMode && React.createElement("div", {
    className: "lights-sidebar"
  }, React.createElement("h2", null, "Furniture"), React.createElement("div", {
    className: "available-furniture",
    draggable: editMode,
    onDragStart: function onDragStart(e) {
      e.dataTransfer.setData('application/json', JSON.stringify({
        type: 'furniture'
      }));
    },
    style: {
      cursor: 'grab'
    }
  }, React.createElement("span", null, "\uD83D\uDCE6"), React.createElement("div", null, "Add Furniture")), React.createElement("div", {
    className: "section-divider"
  }, React.createElement("h2", null, "Available Lights")), unplacedLights.length === 0 ? React.createElement("p", {
    style: {
      color: '#888',
      marginTop: 10,
      fontSize: 12
    }
  }, "All lights placed") : unplacedLights.map(function (light) {
    return React.createElement("div", {
      key: light.code,
      className: "available-light",
      draggable: editMode,
      onDragStart: function onDragStart(e) {
        e.dataTransfer.setData('application/json', JSON.stringify({
          type: 'light',
          code: light.code,
          name: light.name
        }));
      },
      style: {
        cursor: 'grab'
      }
    }, React.createElement("span", null, "\uD83D\uDCA1"), React.createElement("div", null, React.createElement("div", null, light.name), React.createElement("div", {
      className: "light-code"
    }, light.code)));
  }), React.createElement("div", {
    className: "section-divider"
  }, React.createElement("h2", null, "Placed Lights")), lights.map(function (light) {
    return React.createElement("div", {
      key: light.id,
      className: "light-item"
    }, React.createElement("div", null, light.name), React.createElement("div", {
      className: "light-code"
    }, light.code));
  })))));
}
function App() {
  var _useState23 = useState(null),
    _useState24 = _slicedToArray(_useState23, 2),
    config = _useState24[0],
    setConfig = _useState24[1];
  var _useState25 = useState([]),
    _useState26 = _slicedToArray(_useState25, 2),
    rooms = _useState26[0],
    setRooms = _useState26[1];
  var _useState27 = useState(true),
    _useState28 = _slicedToArray(_useState27, 2),
    editMode = _useState28[0],
    setEditMode = _useState28[1];
  var _useState29 = useState(null),
    _useState30 = _slicedToArray(_useState29, 2),
    selectedRoom = _useState30[0],
    setSelectedRoom = _useState30[1];
  var _useState31 = useState(null),
    _useState32 = _slicedToArray(_useState31, 2),
    status = _useState32[0],
    setStatus = _useState32[1];
  var _useState33 = useState({}),
    _useState34 = _slicedToArray(_useState33, 2),
    liveStates = _useState34[0],
    setLiveStates = _useState34[1];
  var _useState35 = useState(false),
    _useState36 = _slicedToArray(_useState35, 2),
    liveConnected = _useState36[0],
    setLiveConnected = _useState36[1];
  var canvasRef = useRef(null);
  var wrapperRef = useRef(null);
  useEffect(function () {
    loadData();
  }, []);
  useEffect(function () {
    var source = API.streamStates({
      onStates: function onStates(states) {
        return setLiveStates(states);
      },
      onStatus: function onStatus(connected) {
        return setLiveConnected(connected);
      }
    });
    return function () {
      return source.close();
    };
  }, []);
  var loadData = function () {
    var _loadData = _asyncToGenerator(_regenerator().m(function _callee9() {
      var cfg, houseMap;
      return _regenerator().w(function (_context9) {
        while (1) switch (_context9.n) {
          case 0:
            _context9.n = 1;
            return API.loadConfig();
          case 1:
            cfg = _context9.v;
            setConfig(cfg);
            _context9.n = 2;
            return API.loadHouseMap();
          case 2:
            houseMap = _context9.v;
            if (houseMap && houseMap.rooms) {
              setRooms(houseMap.rooms);
              setEditMode(false);
            }
          case 3:
            return _context9.a(2);
        }
      }, _callee9);
    }));
    function loadData() {
      return _loadData.apply(this, arguments);
    }
    return loadData;
  }();
  useEffect(function () {
    if (!editMode && canvasRef.current && wrapperRef.current && rooms.length > 0) {
      var wrapper = wrapperRef.current;
      var canvas = canvasRef.current;
      var minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      rooms.forEach(function (room) {
        minX = Math.min(minX, room.x);
        minY = Math.min(minY, room.y);
        maxX = Math.max(maxX, room.x + room.width);
        maxY = Math.max(maxY, room.y + room.height);
      });
      var contentWidth = maxX - minX + 100;
      var contentHeight = maxY - minY + 100;
      var wrapperWidth = wrapper.clientWidth;
      var wrapperHeight = wrapper.clientHeight;
      var scaleX = wrapperWidth / contentWidth;
      var scaleY = wrapperHeight / contentHeight;
      var scale = Math.min(scaleX, scaleY, 1);
      canvas.style.transform = "scale(".concat(scale, ")");
      canvas.style.width = "".concat(contentWidth, "px");
      canvas.style.height = "".concat(contentHeight, "px");
      canvas.classList.add('fit-to-screen');
    } else if (editMode && canvasRef.current) {
      canvasRef.current.style.transform = 'scale(1)';
      canvasRef.current.style.width = '';
      canvasRef.current.style.height = '';
      canvasRef.current.classList.remove('fit-to-screen');
    }
  }, [editMode, rooms]);
  var handleDragOver = function handleDragOver(e) {
    if (!editMode) return;
    e.preventDefault();
  };
  var handleDrop = function handleDrop(e) {
    if (!editMode) return;
    e.preventDefault();
    var areaName = e.dataTransfer.getData('text/plain');
    if (!areaName) return;
    var rect = canvasRef.current.getBoundingClientRect();
    var x = Math.round((e.clientX - rect.left) / 20) * 20;
    var y = Math.round((e.clientY - rect.top) / 20) * 20;
    var newRoom = {
      id: Date.now() + Math.random(),
      name: areaName,
      x: x,
      y: y,
      width: 200,
      height: 200,
      lights: [],
      furniture: []
    };
    setRooms([].concat(_toConsumableArray(rooms), [newRoom]));
  };
  var handleRoomPositionChange = function handleRoomPositionChange(roomId, changes) {
    setRooms(rooms.map(function (r) {
      return r.id === roomId ? _objectSpread(_objectSpread({}, r), changes) : r;
    }));
  };
  var handleSaveMap = function () {
    var _handleSaveMap = _asyncToGenerator(_regenerator().m(function _callee0() {
      var result;
      return _regenerator().w(function (_context0) {
        while (1) switch (_context0.n) {
          case 0:
            _context0.n = 1;
            return API.saveHouseMap({
              rooms: rooms
            });
          case 1:
            result = _context0.v;
            setStatus({
              type: 'success',
              message: 'House map saved to map-conf.json!'
            });
            setTimeout(function () {
              return setStatus(null);
            }, 3000);
            setEditMode(false);
          case 2:
            return _context0.a(2);
        }
      }, _callee0);
    }));
    function handleSaveMap() {
      return _handleSaveMap.apply(this, arguments);
    }
    return handleSaveMap;
  }();
  var handleRoomSelect = function () {
    var _handleRoomSelect = _asyncToGenerator(_regenerator().m(function _callee1(roomId) {
      var room;
      return _regenerator().w(function (_context1) {
        while (1) switch (_context1.n) {
          case 0:
            if (!editMode) {
              _context1.n = 1;
              break;
            }
            return _context1.a(2);
          case 1:
            room = rooms.find(function (r) {
              return r.id === roomId;
            });
            if (room) {
              _context1.n = 2;
              break;
            }
            return _context1.a(2);
          case 2:
            setSelectedRoom(room);
          case 3:
            return _context1.a(2);
        }
      }, _callee1);
    }));
    function handleRoomSelect(_x2) {
      return _handleRoomSelect.apply(this, arguments);
    }
    return handleRoomSelect;
  }();
  var handleRoomSave = function handleRoomSave(roomId, lights, furniture) {
    setRooms(rooms.map(function (r) {
      return r.id === roomId ? _objectSpread(_objectSpread({}, r), {}, {
        lights: lights,
        furniture: furniture
      }) : r;
    }));
  };
  if (!config) {
    return React.createElement("div", {
      className: "app",
      style: {
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, "Loading...");
  }
  var selectedRoomLights = selectedRoom ? config.areas[selectedRoom.name] || [] : [];
  return React.createElement("div", {
    className: "app"
  }, editMode && React.createElement("div", {
    className: "sidebar"
  }, React.createElement("h2", null, "Room Areas"), React.createElement("div", {
    className: "room-list"
  }, Object.keys(config.areas).map(function (areaName) {
    return React.createElement("div", {
      key: areaName,
      className: "room-item",
      draggable: editMode,
      onDragStart: function onDragStart(e) {
        e.dataTransfer.setData('text/plain', areaName);
      },
      style: {
        cursor: 'grab'
      }
    }, areaName, React.createElement("div", {
      style: {
        fontSize: 11,
        color: '#888',
        marginTop: 5
      }
    }, config.areas[areaName].length, " lights"));
  }))), React.createElement("div", {
    className: "canvas-container"
  }, React.createElement("div", {
    className: "toolbar"
  }, React.createElement("button", {
    className: "btn ".concat(editMode ? 'success' : 'secondary'),
    onClick: function onClick() {
      return setEditMode(!editMode);
    }
  }, editMode ? 'Edit Mode' : 'View Mode'), editMode && React.createElement("button", {
    className: "btn success",
    onClick: handleSaveMap
  }, "Save House Map"), React.createElement("div", {
    className: "mode-indicator",
    style: {
      marginLeft: 'auto'
    }
  }, editMode ? '✏️ Edit House Layout' : '👁️ Click Room to View'), React.createElement("div", {
    className: "live-indicator ".concat(liveConnected ? 'connected' : 'disconnected')
  }, liveConnected ? '🟢 LIVE' : '⚪ NO LIVE DATA')), React.createElement("div", {
    ref: wrapperRef,
    className: "canvas-wrapper",
    style: {
      overflow: editMode ? 'auto' : 'hidden',
      display: 'flex',
      alignItems: editMode ? 'flex-start' : 'center',
      justifyContent: editMode ? 'flex-start' : 'center'
    }
  }, React.createElement("div", {
    ref: canvasRef,
    className: "canvas",
    onDragOver: handleDragOver,
    onDrop: handleDrop
  }, rooms.map(function (room) {
    return React.createElement(Room, {
      key: room.id,
      room: room,
      onSelect: handleRoomSelect,
      isSelected: (selectedRoom === null || selectedRoom === void 0 ? void 0 : selectedRoom.id) === room.id,
      editMode: editMode,
      onPositionChange: handleRoomPositionChange
    });
  })))), selectedRoom && React.createElement(RoomEditor, {
    room: selectedRoom,
    liveStates: liveStates,
    onClose: function onClose() {
      return setSelectedRoom(null);
    },
    availableLights: selectedRoomLights,
    onSave: handleRoomSave
  }), status && React.createElement("div", {
    className: "status-message ".concat(status.type)
  }, status.message));
}
ReactDOM.render(React.createElement(App, null), document.getElementById('root'));
