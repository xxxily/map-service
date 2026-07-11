var e=Object.create,t=Object.defineProperty,n=Object.getOwnPropertyDescriptor,r=Object.getOwnPropertyNames,i=Object.getPrototypeOf,a=Object.prototype.hasOwnProperty,o=(e,t)=>()=>(t||(e((t={exports:{}}).exports,t),e=null),t.exports),s=(e,n)=>{let r={};for(var i in e)t(r,i,{get:e[i],enumerable:!0});return n||t(r,Symbol.toStringTag,{value:`Module`}),r},c=(e,i,o,s)=>{if(i&&typeof i==`object`||typeof i==`function`)for(var c=r(i),l=0,u=c.length,d;l<u;l++)d=c[l],!a.call(e,d)&&d!==o&&t(e,d,{get:(e=>i[e]).bind(null,d),enumerable:!(s=n(i,d))||s.enumerable});return e},l=(n,r,a)=>(a=n==null?{}:e(i(n)),c(r||!n||!n.__esModule?t(a,`default`,{value:n,enumerable:!0}):a,n)),u=(e=>typeof require<`u`?require:typeof Proxy<`u`?new Proxy(e,{get:(e,t)=>(typeof require<`u`?require:e)[t]}):e)(function(e){if(typeof require<`u`)return require.apply(this,arguments);throw Error('Calling `require` for "'+e+"\" in an environment that doesn't expose the `require` function. See https://rolldown.rs/in-depth/bundling-cjs#require-external-modules for more details.")});(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),e.crossOrigin===`use-credentials`?t.credentials=`include`:e.crossOrigin===`anonymous`?t.credentials=`omit`:t.credentials=`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var d=o(((e,t)=>{(function(n,r){typeof e==`object`&&t!==void 0?t.exports=r():typeof define==`function`&&define.amd?define(r):(n||=self,n.AMapLoader=r())})(e,function(){function e(e){var r=[];return e.AMapUI&&r.push(t(e.AMapUI)),e.Loca&&r.push(n(e.Loca)),Promise.all(r)}function t(e){return new Promise(function(t,n){var s=[];if(e.plugins)for(var c=0;c<e.plugins.length;c+=1)i.AMapUI.plugins.indexOf(e.plugins[c])==-1&&s.push(e.plugins[c]);if(a.AMapUI===r.failed)n(`前次请求 AMapUI 失败`);else if(a.AMapUI===r.notload){a.AMapUI=r.loading,i.AMapUI.version=e.version||i.AMapUI.version,c=i.AMapUI.version;var l=document.body||document.head,u=document.createElement(`script`);u.type=`text/javascript`,u.src=`https://webapi.amap.com/ui/`+c+`/main.js`,u.onerror=function(e){a.AMapUI=r.failed,n(`请求 AMapUI 失败`)},u.onload=function(){if(a.AMapUI=r.loaded,s.length)window.AMapUI.loadUI(s,function(){for(var e=0,n=s.length;e<n;e++){var r=s[e].split(`/`).slice(-1)[0];window.AMapUI[r]=arguments[e]}for(t();o.AMapUI.length;)o.AMapUI.splice(0,1)[0]()});else for(t();o.AMapUI.length;)o.AMapUI.splice(0,1)[0]()},l.appendChild(u)}else a.AMapUI===r.loaded?e.version&&e.version!==i.AMapUI.version?n(`不允许多个版本 AMapUI 混用`):s.length?window.AMapUI.loadUI(s,function(){for(var e=0,n=s.length;e<n;e++){var r=s[e].split(`/`).slice(-1)[0];window.AMapUI[r]=arguments[e]}t()}):t():e.version&&e.version!==i.AMapUI.version?n(`不允许多个版本 AMapUI 混用`):o.AMapUI.push(function(e){e?n(e):s.length?window.AMapUI.loadUI(s,function(){for(var e=0,n=s.length;e<n;e++){var r=s[e].split(`/`).slice(-1)[0];window.AMapUI[r]=arguments[e]}t()}):t()})})}function n(e){return new Promise(function(t,n){if(a.Loca===r.failed)n(`前次请求 Loca 失败`);else if(a.Loca===r.notload){a.Loca=r.loading,i.Loca.version=e.version||i.Loca.version;var s=i.Loca.version,c=i.AMap.version.startsWith(`2`),l=s.startsWith(`2`);if(c&&!l||!c&&l)n(`JSAPI 与 Loca 版本不对应！！`);else{c=i.key,l=document.body||document.head;var u=document.createElement(`script`);u.type=`text/javascript`,u.src=`https://webapi.amap.com/loca?v=`+s+`&key=`+c,u.onerror=function(e){a.Loca=r.failed,n(`请求 AMapUI 失败`)},u.onload=function(){for(a.Loca=r.loaded,t();o.Loca.length;)o.Loca.splice(0,1)[0]()},l.appendChild(u)}}else a.Loca===r.loaded?e.version&&e.version!==i.Loca.version?n(`不允许多个版本 Loca 混用`):t():e.version&&e.version!==i.Loca.version?n(`不允许多个版本 Loca 混用`):o.Loca.push(function(e){e?n(e):n()})})}if(!window)throw Error(`AMap JSAPI can only be used in Browser.`);var r;(function(e){e.notload=`notload`,e.loading=`loading`,e.loaded=`loaded`,e.failed=`failed`})(r||={});var i={key:``,AMap:{version:`1.4.15`,plugins:[]},AMapUI:{version:`1.1`,plugins:[]},Loca:{version:`1.3.2`}},a={AMap:r.notload,AMapUI:r.notload,Loca:r.notload},o={AMap:[],AMapUI:[],Loca:[]},s=[],c=function(e){typeof e==`function`&&(a.AMap===r.loaded?e(window.AMap):s.push(e))};return{load:function(t){return new Promise(function(n,o){if(a.AMap==r.failed)o(``);else if(a.AMap==r.notload){var l=t.key,u=t.version,d=t.plugins;l?(window.AMap&&location.host!==`lbs.amap.com`&&o(`禁止多种API加载方式混用`),i.key=l,i.AMap.version=u||i.AMap.version,i.AMap.plugins=d||i.AMap.plugins,a.AMap=r.loading,u=document.body||document.head,window.___onAPILoaded=function(i){if(delete window.___onAPILoaded,i)a.AMap=r.failed,o(i);else for(a.AMap=r.loaded,e(t).then(function(){n(window.AMap)}).catch(o);s.length;)s.splice(0,1)[0]()},d=document.createElement(`script`),d.type=`text/javascript`,d.src=`https://webapi.amap.com/maps?callback=___onAPILoaded&v=`+i.AMap.version+`&key=`+l+`&plugin=`+i.AMap.plugins.join(`,`),d.onerror=function(e){a.AMap=r.failed,o(e)},u.appendChild(d)):o(`请填写key`)}else if(a.AMap==r.loaded)if(t.key&&t.key!==i.key)o(`多个不一致的 key`);else if(t.version&&t.version!==i.AMap.version)o(`不允许多个版本 JSAPI 混用`);else{if(l=[],t.plugins)for(u=0;u<t.plugins.length;u+=1)i.AMap.plugins.indexOf(t.plugins[u])==-1&&l.push(t.plugins[u]);l.length?window.AMap.plugin(l,function(){e(t).then(function(){n(window.AMap)}).catch(o)}):e(t).then(function(){n(window.AMap)}).catch(o)}else if(t.key&&t.key!==i.key)o(`多个不一致的 key`);else if(t.version&&t.version!==i.AMap.version)o(`不允许多个版本 JSAPI 混用`);else{var f=[];if(t.plugins)for(u=0;u<t.plugins.length;u+=1)i.AMap.plugins.indexOf(t.plugins[u])==-1&&f.push(t.plugins[u]);c(function(){f.length?window.AMap.plugin(f,function(){e(t).then(function(){n(window.AMap)}).catch(o)}):e(t).then(function(){n(window.AMap)}).catch(o)})}})},reset:function(){delete window.AMap,delete window.AMapUI,delete window.Loca,i={key:``,AMap:{version:`1.4.15`,plugins:[]},AMapUI:{version:`1.1`,plugins:[]},Loca:{version:`1.3.2`}},a={AMap:r.notload,AMapUI:r.notload,Loca:r.notload},o={AMap:[],AMapUI:[],Loca:[]}}}})})),f=o(((e,t)=>{(function(n,r){typeof e==`object`&&t!==void 0?r(e):typeof define==`function`&&define.amd?define([`exports`],r):(n=typeof globalThis<`u`?globalThis:n||self,r(n.leaflet={}))})(e,(function(e){var t=`1.9.4`;function n(e){var t,n,r,i;for(n=1,r=arguments.length;n<r;n++)for(t in i=arguments[n],i)e[t]=i[t];return e}var r=Object.create||(function(){function e(){}return function(t){return e.prototype=t,new e}})();function i(e,t){var n=Array.prototype.slice;if(e.bind)return e.bind.apply(e,n.call(arguments,1));var r=n.call(arguments,2);return function(){return e.apply(t,r.length?r.concat(n.call(arguments)):arguments)}}var a=0;function o(e){return`_leaflet_id`in e||(e._leaflet_id=++a),e._leaflet_id}function s(e,t,n){var r,i,a,o=function(){r=!1,i&&=(a.apply(n,i),!1)};return a=function(){r?i=arguments:(e.apply(n,arguments),setTimeout(o,t),r=!0)},a}function c(e,t,n){var r=t[1],i=t[0],a=r-i;return e===r&&n?e:((e-i)%a+a)%a+i}function l(){return!1}function u(e,t){if(t===!1)return e;var n=10**(t===void 0?6:t);return Math.round(e*n)/n}function d(e){return e.trim?e.trim():e.replace(/^\s+|\s+$/g,``)}function f(e){return d(e).split(/\s+/)}function p(e,t){for(var n in Object.prototype.hasOwnProperty.call(e,`options`)||(e.options=e.options?r(e.options):{}),t)e.options[n]=t[n];return e.options}function m(e,t,n){var r=[];for(var i in e)r.push(encodeURIComponent(n?i.toUpperCase():i)+`=`+encodeURIComponent(e[i]));return(!t||t.indexOf(`?`)===-1?`?`:`&`)+r.join(`&`)}var h=/\{ *([\w_ -]+) *\}/g;function g(e,t){return e.replace(h,function(e,n){var r=t[n];if(r===void 0)throw Error(`No value provided for variable `+e);return typeof r==`function`&&(r=r(t)),r})}var _=Array.isArray||function(e){return Object.prototype.toString.call(e)===`[object Array]`};function ee(e,t){for(var n=0;n<e.length;n++)if(e[n]===t)return n;return-1}var te=`data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=`;function v(e){return window[`webkit`+e]||window[`moz`+e]||window[`ms`+e]}var y=0;function ne(e){var t=+new Date,n=Math.max(0,16-(t-y));return y=t+n,window.setTimeout(e,n)}var b=window.requestAnimationFrame||v(`RequestAnimationFrame`)||ne,re=window.cancelAnimationFrame||v(`CancelAnimationFrame`)||v(`CancelRequestAnimationFrame`)||function(e){window.clearTimeout(e)};function x(e,t,n){if(n&&b===ne)e.call(t);else return b.call(window,i(e,t))}function S(e){e&&re.call(window,e)}var ie={__proto__:null,extend:n,create:r,bind:i,get lastId(){return a},stamp:o,throttle:s,wrapNum:c,falseFn:l,formatNum:u,trim:d,splitWords:f,setOptions:p,getParamString:m,template:g,isArray:_,indexOf:ee,emptyImageUrl:te,requestFn:b,cancelFn:re,requestAnimFrame:x,cancelAnimFrame:S};function C(){}C.extend=function(e){var t=function(){p(this),this.initialize&&this.initialize.apply(this,arguments),this.callInitHooks()},i=t.__super__=this.prototype,a=r(i);for(var o in a.constructor=t,t.prototype=a,this)Object.prototype.hasOwnProperty.call(this,o)&&o!==`prototype`&&o!==`__super__`&&(t[o]=this[o]);return e.statics&&n(t,e.statics),e.includes&&(ae(e.includes),n.apply(null,[a].concat(e.includes))),n(a,e),delete a.statics,delete a.includes,a.options&&(a.options=i.options?r(i.options):{},n(a.options,e.options)),a._initHooks=[],a.callInitHooks=function(){if(!this._initHooksCalled){i.callInitHooks&&i.callInitHooks.call(this),this._initHooksCalled=!0;for(var e=0,t=a._initHooks.length;e<t;e++)a._initHooks[e].call(this)}},t},C.include=function(e){var t=this.prototype.options;return n(this.prototype,e),e.options&&(this.prototype.options=t,this.mergeOptions(e.options)),this},C.mergeOptions=function(e){return n(this.prototype.options,e),this},C.addInitHook=function(e){var t=Array.prototype.slice.call(arguments,1),n=typeof e==`function`?e:function(){this[e].apply(this,t)};return this.prototype._initHooks=this.prototype._initHooks||[],this.prototype._initHooks.push(n),this};function ae(e){if(!(typeof L>`u`||!L||!L.Mixin)){e=_(e)?e:[e];for(var t=0;t<e.length;t++)e[t]===L.Mixin.Events&&console.warn(`Deprecated include of L.Mixin.Events: this property will be removed in future releases, please inherit from L.Evented instead.`,Error().stack)}}var w={on:function(e,t,n){if(typeof e==`object`)for(var r in e)this._on(r,e[r],t);else{e=f(e);for(var i=0,a=e.length;i<a;i++)this._on(e[i],t,n)}return this},off:function(e,t,n){if(!arguments.length)delete this._events;else if(typeof e==`object`)for(var r in e)this._off(r,e[r],t);else{e=f(e);for(var i=arguments.length===1,a=0,o=e.length;a<o;a++)i?this._off(e[a]):this._off(e[a],t,n)}return this},_on:function(e,t,n,r){if(typeof t!=`function`){console.warn(`wrong listener type: `+typeof t);return}if(this._listens(e,t,n)===!1){n===this&&(n=void 0);var i={fn:t,ctx:n};r&&(i.once=!0),this._events=this._events||{},this._events[e]=this._events[e]||[],this._events[e].push(i)}},_off:function(e,t,n){var r,i,a;if(this._events&&(r=this._events[e],r)){if(arguments.length===1){if(this._firingCount)for(i=0,a=r.length;i<a;i++)r[i].fn=l;delete this._events[e];return}if(typeof t!=`function`){console.warn(`wrong listener type: `+typeof t);return}var o=this._listens(e,t,n);if(o!==!1){var s=r[o];this._firingCount&&(s.fn=l,this._events[e]=r=r.slice()),r.splice(o,1)}}},fire:function(e,t,r){if(!this.listens(e,r))return this;var i=n({},t,{type:e,target:this,sourceTarget:t&&t.sourceTarget||this});if(this._events){var a=this._events[e];if(a){this._firingCount=this._firingCount+1||1;for(var o=0,s=a.length;o<s;o++){var c=a[o],l=c.fn;c.once&&this.off(e,l,c.ctx),l.call(c.ctx||this,i)}this._firingCount--}}return r&&this._propagateEvent(i),this},listens:function(e,t,n,r){typeof e!=`string`&&console.warn(`"string" type argument expected`);var i=t;typeof t!=`function`&&(r=!!t,i=void 0,n=void 0);var a=this._events&&this._events[e];if(a&&a.length&&this._listens(e,i,n)!==!1)return!0;if(r){for(var o in this._eventParents)if(this._eventParents[o].listens(e,t,n,r))return!0}return!1},_listens:function(e,t,n){if(!this._events)return!1;var r=this._events[e]||[];if(!t)return!!r.length;n===this&&(n=void 0);for(var i=0,a=r.length;i<a;i++)if(r[i].fn===t&&r[i].ctx===n)return i;return!1},once:function(e,t,n){if(typeof e==`object`)for(var r in e)this._on(r,e[r],t,!0);else{e=f(e);for(var i=0,a=e.length;i<a;i++)this._on(e[i],t,n,!0)}return this},addEventParent:function(e){return this._eventParents=this._eventParents||{},this._eventParents[o(e)]=e,this},removeEventParent:function(e){return this._eventParents&&delete this._eventParents[o(e)],this},_propagateEvent:function(e){for(var t in this._eventParents)this._eventParents[t].fire(e.type,n({layer:e.target,propagatedFrom:e.target},e),!0)}};w.addEventListener=w.on,w.removeEventListener=w.clearAllEventListeners=w.off,w.addOneTimeEventListener=w.once,w.fireEvent=w.fire,w.hasEventListeners=w.listens;var T=C.extend(w);function E(e,t,n){this.x=n?Math.round(e):e,this.y=n?Math.round(t):t}var oe=Math.trunc||function(e){return e>0?Math.floor(e):Math.ceil(e)};E.prototype={clone:function(){return new E(this.x,this.y)},add:function(e){return this.clone()._add(D(e))},_add:function(e){return this.x+=e.x,this.y+=e.y,this},subtract:function(e){return this.clone()._subtract(D(e))},_subtract:function(e){return this.x-=e.x,this.y-=e.y,this},divideBy:function(e){return this.clone()._divideBy(e)},_divideBy:function(e){return this.x/=e,this.y/=e,this},multiplyBy:function(e){return this.clone()._multiplyBy(e)},_multiplyBy:function(e){return this.x*=e,this.y*=e,this},scaleBy:function(e){return new E(this.x*e.x,this.y*e.y)},unscaleBy:function(e){return new E(this.x/e.x,this.y/e.y)},round:function(){return this.clone()._round()},_round:function(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this},floor:function(){return this.clone()._floor()},_floor:function(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this},ceil:function(){return this.clone()._ceil()},_ceil:function(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this},trunc:function(){return this.clone()._trunc()},_trunc:function(){return this.x=oe(this.x),this.y=oe(this.y),this},distanceTo:function(e){e=D(e);var t=e.x-this.x,n=e.y-this.y;return Math.sqrt(t*t+n*n)},equals:function(e){return e=D(e),e.x===this.x&&e.y===this.y},contains:function(e){return e=D(e),Math.abs(e.x)<=Math.abs(this.x)&&Math.abs(e.y)<=Math.abs(this.y)},toString:function(){return`Point(`+u(this.x)+`, `+u(this.y)+`)`}};function D(e,t,n){return e instanceof E?e:_(e)?new E(e[0],e[1]):e==null?e:typeof e==`object`&&`x`in e&&`y`in e?new E(e.x,e.y):new E(e,t,n)}function O(e,t){if(e)for(var n=t?[e,t]:e,r=0,i=n.length;r<i;r++)this.extend(n[r])}O.prototype={extend:function(e){var t,n;if(!e)return this;if(e instanceof E||typeof e[0]==`number`||`x`in e)t=n=D(e);else if(e=k(e),t=e.min,n=e.max,!t||!n)return this;return!this.min&&!this.max?(this.min=t.clone(),this.max=n.clone()):(this.min.x=Math.min(t.x,this.min.x),this.max.x=Math.max(n.x,this.max.x),this.min.y=Math.min(t.y,this.min.y),this.max.y=Math.max(n.y,this.max.y)),this},getCenter:function(e){return D((this.min.x+this.max.x)/2,(this.min.y+this.max.y)/2,e)},getBottomLeft:function(){return D(this.min.x,this.max.y)},getTopRight:function(){return D(this.max.x,this.min.y)},getTopLeft:function(){return this.min},getBottomRight:function(){return this.max},getSize:function(){return this.max.subtract(this.min)},contains:function(e){var t,n;return e=typeof e[0]==`number`||e instanceof E?D(e):k(e),e instanceof O?(t=e.min,n=e.max):t=n=e,t.x>=this.min.x&&n.x<=this.max.x&&t.y>=this.min.y&&n.y<=this.max.y},intersects:function(e){e=k(e);var t=this.min,n=this.max,r=e.min,i=e.max,a=i.x>=t.x&&r.x<=n.x,o=i.y>=t.y&&r.y<=n.y;return a&&o},overlaps:function(e){e=k(e);var t=this.min,n=this.max,r=e.min,i=e.max,a=i.x>t.x&&r.x<n.x,o=i.y>t.y&&r.y<n.y;return a&&o},isValid:function(){return!!(this.min&&this.max)},pad:function(e){var t=this.min,n=this.max,r=Math.abs(t.x-n.x)*e,i=Math.abs(t.y-n.y)*e;return k(D(t.x-r,t.y-i),D(n.x+r,n.y+i))},equals:function(e){return e?(e=k(e),this.min.equals(e.getTopLeft())&&this.max.equals(e.getBottomRight())):!1}};function k(e,t){return!e||e instanceof O?e:new O(e,t)}function A(e,t){if(e)for(var n=t?[e,t]:e,r=0,i=n.length;r<i;r++)this.extend(n[r])}A.prototype={extend:function(e){var t=this._southWest,n=this._northEast,r,i;if(e instanceof M)r=e,i=e;else if(e instanceof A){if(r=e._southWest,i=e._northEast,!r||!i)return this}else return e?this.extend(N(e)||j(e)):this;return!t&&!n?(this._southWest=new M(r.lat,r.lng),this._northEast=new M(i.lat,i.lng)):(t.lat=Math.min(r.lat,t.lat),t.lng=Math.min(r.lng,t.lng),n.lat=Math.max(i.lat,n.lat),n.lng=Math.max(i.lng,n.lng)),this},pad:function(e){var t=this._southWest,n=this._northEast,r=Math.abs(t.lat-n.lat)*e,i=Math.abs(t.lng-n.lng)*e;return new A(new M(t.lat-r,t.lng-i),new M(n.lat+r,n.lng+i))},getCenter:function(){return new M((this._southWest.lat+this._northEast.lat)/2,(this._southWest.lng+this._northEast.lng)/2)},getSouthWest:function(){return this._southWest},getNorthEast:function(){return this._northEast},getNorthWest:function(){return new M(this.getNorth(),this.getWest())},getSouthEast:function(){return new M(this.getSouth(),this.getEast())},getWest:function(){return this._southWest.lng},getSouth:function(){return this._southWest.lat},getEast:function(){return this._northEast.lng},getNorth:function(){return this._northEast.lat},contains:function(e){e=typeof e[0]==`number`||e instanceof M||`lat`in e?N(e):j(e);var t=this._southWest,n=this._northEast,r,i;return e instanceof A?(r=e.getSouthWest(),i=e.getNorthEast()):r=i=e,r.lat>=t.lat&&i.lat<=n.lat&&r.lng>=t.lng&&i.lng<=n.lng},intersects:function(e){e=j(e);var t=this._southWest,n=this._northEast,r=e.getSouthWest(),i=e.getNorthEast(),a=i.lat>=t.lat&&r.lat<=n.lat,o=i.lng>=t.lng&&r.lng<=n.lng;return a&&o},overlaps:function(e){e=j(e);var t=this._southWest,n=this._northEast,r=e.getSouthWest(),i=e.getNorthEast(),a=i.lat>t.lat&&r.lat<n.lat,o=i.lng>t.lng&&r.lng<n.lng;return a&&o},toBBoxString:function(){return[this.getWest(),this.getSouth(),this.getEast(),this.getNorth()].join(`,`)},equals:function(e,t){return e?(e=j(e),this._southWest.equals(e.getSouthWest(),t)&&this._northEast.equals(e.getNorthEast(),t)):!1},isValid:function(){return!!(this._southWest&&this._northEast)}};function j(e,t){return e instanceof A?e:new A(e,t)}function M(e,t,n){if(isNaN(e)||isNaN(t))throw Error(`Invalid LatLng object: (`+e+`, `+t+`)`);this.lat=+e,this.lng=+t,n!==void 0&&(this.alt=+n)}M.prototype={equals:function(e,t){return e?(e=N(e),Math.max(Math.abs(this.lat-e.lat),Math.abs(this.lng-e.lng))<=(t===void 0?1e-9:t)):!1},toString:function(e){return`LatLng(`+u(this.lat,e)+`, `+u(this.lng,e)+`)`},distanceTo:function(e){return P.distance(this,N(e))},wrap:function(){return P.wrapLatLng(this)},toBounds:function(e){var t=180*e/40075017,n=t/Math.cos(Math.PI/180*this.lat);return j([this.lat-t,this.lng-n],[this.lat+t,this.lng+n])},clone:function(){return new M(this.lat,this.lng,this.alt)}};function N(e,t,n){return e instanceof M?e:_(e)&&typeof e[0]!=`object`?e.length===3?new M(e[0],e[1],e[2]):e.length===2?new M(e[0],e[1]):null:e==null?e:typeof e==`object`&&`lat`in e?new M(e.lat,`lng`in e?e.lng:e.lon,e.alt):t===void 0?null:new M(e,t,n)}var se={latLngToPoint:function(e,t){var n=this.projection.project(e),r=this.scale(t);return this.transformation._transform(n,r)},pointToLatLng:function(e,t){var n=this.scale(t),r=this.transformation.untransform(e,n);return this.projection.unproject(r)},project:function(e){return this.projection.project(e)},unproject:function(e){return this.projection.unproject(e)},scale:function(e){return 256*2**e},zoom:function(e){return Math.log(e/256)/Math.LN2},getProjectedBounds:function(e){if(this.infinite)return null;var t=this.projection.bounds,n=this.scale(e);return new O(this.transformation.transform(t.min,n),this.transformation.transform(t.max,n))},infinite:!1,wrapLatLng:function(e){var t=this.wrapLng?c(e.lng,this.wrapLng,!0):e.lng,n=this.wrapLat?c(e.lat,this.wrapLat,!0):e.lat,r=e.alt;return new M(n,t,r)},wrapLatLngBounds:function(e){var t=e.getCenter(),n=this.wrapLatLng(t),r=t.lat-n.lat,i=t.lng-n.lng;if(r===0&&i===0)return e;var a=e.getSouthWest(),o=e.getNorthEast();return new A(new M(a.lat-r,a.lng-i),new M(o.lat-r,o.lng-i))}},P=n({},se,{wrapLng:[-180,180],R:6371e3,distance:function(e,t){var n=Math.PI/180,r=e.lat*n,i=t.lat*n,a=Math.sin((t.lat-e.lat)*n/2),o=Math.sin((t.lng-e.lng)*n/2),s=a*a+Math.cos(r)*Math.cos(i)*o*o,c=2*Math.atan2(Math.sqrt(s),Math.sqrt(1-s));return this.R*c}}),ce=6378137,le={R:ce,MAX_LATITUDE:85.0511287798,project:function(e){var t=Math.PI/180,n=this.MAX_LATITUDE,r=Math.max(Math.min(n,e.lat),-n),i=Math.sin(r*t);return new E(this.R*e.lng*t,this.R*Math.log((1+i)/(1-i))/2)},unproject:function(e){var t=180/Math.PI;return new M((2*Math.atan(Math.exp(e.y/this.R))-Math.PI/2)*t,e.x*t/this.R)},bounds:(function(){var e=ce*Math.PI;return new O([-e,-e],[e,e])})()};function ue(e,t,n,r){if(_(e)){this._a=e[0],this._b=e[1],this._c=e[2],this._d=e[3];return}this._a=e,this._b=t,this._c=n,this._d=r}ue.prototype={transform:function(e,t){return this._transform(e.clone(),t)},_transform:function(e,t){return t||=1,e.x=t*(this._a*e.x+this._b),e.y=t*(this._c*e.y+this._d),e},untransform:function(e,t){return t||=1,new E((e.x/t-this._b)/this._a,(e.y/t-this._d)/this._c)}};function de(e,t,n,r){return new ue(e,t,n,r)}var fe=n({},P,{code:`EPSG:3857`,projection:le,transformation:function(){var e=.5/(Math.PI*le.R);return de(e,.5,-e,.5)}()}),pe=n({},fe,{code:`EPSG:900913`});function me(e){return document.createElementNS(`http://www.w3.org/2000/svg`,e)}function he(e,t){var n=``,r,i,a,o,s,c;for(r=0,a=e.length;r<a;r++){for(s=e[r],i=0,o=s.length;i<o;i++)c=s[i],n+=(i?`L`:`M`)+c.x+` `+c.y;n+=t?z.svg?`z`:`x`:``}return n||`M0 0`}var ge=document.documentElement.style,_e=`ActiveXObject`in window,ve=_e&&!document.addEventListener,F=`msLaunchUri`in navigator&&!(`documentMode`in document),I=Xe(`webkit`),ye=Xe(`android`),be=Xe(`android 2`)||Xe(`android 3`),xe=parseInt(/WebKit\/([0-9]+)|$/.exec(navigator.userAgent)[1],10),Se=ye&&Xe(`Google`)&&xe<537&&!(`AudioNode`in window),Ce=!!window.opera,we=!F&&Xe(`chrome`),Te=Xe(`gecko`)&&!I&&!Ce&&!_e,Ee=!we&&Xe(`safari`),De=Xe(`phantom`),Oe=`OTransition`in ge,ke=navigator.platform.indexOf(`Win`)===0,Ae=_e&&`transition`in ge,je=`WebKitCSSMatrix`in window&&`m11`in new window.WebKitCSSMatrix&&!be,Me=`MozPerspective`in ge,Ne=!window.L_DISABLE_3D&&(Ae||je||Me)&&!Oe&&!De,Pe=typeof orientation<`u`||Xe(`mobile`),Fe=Pe&&I,Ie=Pe&&je,Le=!window.PointerEvent&&window.MSPointerEvent,R=!!(window.PointerEvent||Le),Re=`ontouchstart`in window||!!window.TouchEvent,ze=!window.L_NO_TOUCH&&(Re||R),Be=Pe&&Ce,Ve=Pe&&Te,He=(window.devicePixelRatio||window.screen.deviceXDPI/window.screen.logicalXDPI)>1,Ue=function(){var e=!1;try{var t=Object.defineProperty({},"passive",{get:function(){e=!0}});window.addEventListener(`testPassiveEventSupport`,l,t),window.removeEventListener(`testPassiveEventSupport`,l,t)}catch{}return e}(),We=function(){return!!document.createElement(`canvas`).getContext}(),Ge=!!(document.createElementNS&&me(`svg`).createSVGRect),Ke=!!Ge&&(function(){var e=document.createElement(`div`);return e.innerHTML=`<svg/>`,(e.firstChild&&e.firstChild.namespaceURI)===`http://www.w3.org/2000/svg`})(),qe=!Ge&&function(){try{var e=document.createElement(`div`);e.innerHTML=`<v:shape adj="1"/>`;var t=e.firstChild;return t.style.behavior=`url(#default#VML)`,t&&typeof t.adj==`object`}catch{return!1}}(),Je=navigator.platform.indexOf(`Mac`)===0,Ye=navigator.platform.indexOf(`Linux`)===0;function Xe(e){return navigator.userAgent.toLowerCase().indexOf(e)>=0}var z={ie:_e,ielt9:ve,edge:F,webkit:I,android:ye,android23:be,androidStock:Se,opera:Ce,chrome:we,gecko:Te,safari:Ee,phantom:De,opera12:Oe,win:ke,ie3d:Ae,webkit3d:je,gecko3d:Me,any3d:Ne,mobile:Pe,mobileWebkit:Fe,mobileWebkit3d:Ie,msPointer:Le,pointer:R,touch:ze,touchNative:Re,mobileOpera:Be,mobileGecko:Ve,retina:He,passiveEvents:Ue,canvas:We,svg:Ge,vml:qe,inlineSvg:Ke,mac:Je,linux:Ye},Ze=z.msPointer?`MSPointerDown`:`pointerdown`,Qe=z.msPointer?`MSPointerMove`:`pointermove`,$e=z.msPointer?`MSPointerUp`:`pointerup`,et=z.msPointer?`MSPointerCancel`:`pointercancel`,tt={touchstart:Ze,touchmove:Qe,touchend:$e,touchcancel:et},nt={touchstart:ft,touchmove:dt,touchend:dt,touchcancel:dt},rt={},it=!1;function at(e,t,n){return t===`touchstart`&&ut(),nt[t]?(n=nt[t].bind(this,n),e.addEventListener(tt[t],n,!1),n):(console.warn(`wrong event specified:`,t),l)}function ot(e,t,n){if(!tt[t]){console.warn(`wrong event specified:`,t);return}e.removeEventListener(tt[t],n,!1)}function st(e){rt[e.pointerId]=e}function ct(e){rt[e.pointerId]&&(rt[e.pointerId]=e)}function lt(e){delete rt[e.pointerId]}function ut(){it||=(document.addEventListener(Ze,st,!0),document.addEventListener(Qe,ct,!0),document.addEventListener($e,lt,!0),document.addEventListener(et,lt,!0),!0)}function dt(e,t){if(t.pointerType!==(t.MSPOINTER_TYPE_MOUSE||`mouse`)){for(var n in t.touches=[],rt)t.touches.push(rt[n]);t.changedTouches=[t],e(t)}}function ft(e,t){t.MSPOINTER_TYPE_TOUCH&&t.pointerType===t.MSPOINTER_TYPE_TOUCH&&J(t),dt(e,t)}function pt(e){var t={},n,r;for(r in e)n=e[r],t[r]=n&&n.bind?n.bind(e):n;return e=t,t.type=`dblclick`,t.detail=2,t.isTrusted=!1,t._simulated=!0,t}var mt=200;function ht(e,t){e.addEventListener(`dblclick`,t);var n=0,r;function i(e){if(e.detail!==1){r=e.detail;return}if(!(e.pointerType===`mouse`||e.sourceCapabilities&&!e.sourceCapabilities.firesTouchEvents)){var i=en(e);if(!(i.some(function(e){return e instanceof HTMLLabelElement&&e.attributes.for})&&!i.some(function(e){return e instanceof HTMLInputElement||e instanceof HTMLSelectElement}))){var a=Date.now();a-n<=mt?(r++,r===2&&t(pt(e))):r=1,n=a}}}return e.addEventListener(`click`,i),{dblclick:t,simDblclick:i}}function gt(e,t){e.removeEventListener(`dblclick`,t.dblclick),e.removeEventListener(`click`,t.simDblclick)}var _t=At([`transform`,`webkitTransform`,`OTransform`,`MozTransform`,`msTransform`]),vt=At([`webkitTransition`,`transition`,`OTransition`,`MozTransition`,`msTransition`]),yt=vt===`webkitTransition`||vt===`OTransition`?vt+`End`:`transitionend`;function bt(e){return typeof e==`string`?document.getElementById(e):e}function xt(e,t){var n=e.style[t]||e.currentStyle&&e.currentStyle[t];if((!n||n===`auto`)&&document.defaultView){var r=document.defaultView.getComputedStyle(e,null);n=r?r[t]:null}return n===`auto`?null:n}function B(e,t,n){var r=document.createElement(e);return r.className=t||``,n&&n.appendChild(r),r}function V(e){var t=e.parentNode;t&&t.removeChild(e)}function St(e){for(;e.firstChild;)e.removeChild(e.firstChild)}function Ct(e){var t=e.parentNode;t&&t.lastChild!==e&&t.appendChild(e)}function wt(e){var t=e.parentNode;t&&t.firstChild!==e&&t.insertBefore(e,t.firstChild)}function Tt(e,t){if(e.classList!==void 0)return e.classList.contains(t);var n=Dt(e);return n.length>0&&RegExp(`(^|\\s)`+t+`(\\s|$)`).test(n)}function H(e,t){if(e.classList!==void 0)for(var n=f(t),r=0,i=n.length;r<i;r++)e.classList.add(n[r]);else if(!Tt(e,t)){var a=Dt(e);Et(e,(a?a+` `:``)+t)}}function U(e,t){e.classList===void 0?Et(e,d((` `+Dt(e)+` `).replace(` `+t+` `,` `))):e.classList.remove(t)}function Et(e,t){e.className.baseVal===void 0?e.className=t:e.className.baseVal=t}function Dt(e){return e.correspondingElement&&(e=e.correspondingElement),e.className.baseVal===void 0?e.className:e.className.baseVal}function Ot(e,t){`opacity`in e.style?e.style.opacity=t:`filter`in e.style&&kt(e,t)}function kt(e,t){var n=!1,r=`DXImageTransform.Microsoft.Alpha`;try{n=e.filters.item(r)}catch{if(t===1)return}t=Math.round(t*100),n?(n.Enabled=t!==100,n.Opacity=t):e.style.filter+=` progid:`+r+`(opacity=`+t+`)`}function At(e){for(var t=document.documentElement.style,n=0;n<e.length;n++)if(e[n]in t)return e[n];return!1}function jt(e,t,n){var r=t||new E(0,0);e.style[_t]=(z.ie3d?`translate(`+r.x+`px,`+r.y+`px)`:`translate3d(`+r.x+`px,`+r.y+`px,0)`)+(n?` scale(`+n+`)`:``)}function W(e,t){e._leaflet_pos=t,z.any3d?jt(e,t):(e.style.left=t.x+`px`,e.style.top=t.y+`px`)}function Mt(e){return e._leaflet_pos||new E(0,0)}var Nt,G,Pt;if(`onselectstart`in document)Nt=function(){K(window,`selectstart`,J)},G=function(){q(window,`selectstart`,J)};else{var Ft=At([`userSelect`,`WebkitUserSelect`,`OUserSelect`,`MozUserSelect`,`msUserSelect`]);Nt=function(){if(Ft){var e=document.documentElement.style;Pt=e[Ft],e[Ft]=`none`}},G=function(){Ft&&(document.documentElement.style[Ft]=Pt,Pt=void 0)}}function It(){K(window,`dragstart`,J)}function Lt(){q(window,`dragstart`,J)}var Rt,zt;function Bt(e){for(;e.tabIndex===-1;)e=e.parentNode;e.style&&(Vt(),Rt=e,zt=e.style.outlineStyle,e.style.outlineStyle=`none`,K(window,`keydown`,Vt))}function Vt(){Rt&&(Rt.style.outlineStyle=zt,Rt=void 0,zt=void 0,q(window,`keydown`,Vt))}function Ht(e){do e=e.parentNode;while((!e.offsetWidth||!e.offsetHeight)&&e!==document.body);return e}function Ut(e){var t=e.getBoundingClientRect();return{x:t.width/e.offsetWidth||1,y:t.height/e.offsetHeight||1,boundingClientRect:t}}var Wt={__proto__:null,TRANSFORM:_t,TRANSITION:vt,TRANSITION_END:yt,get:bt,getStyle:xt,create:B,remove:V,empty:St,toFront:Ct,toBack:wt,hasClass:Tt,addClass:H,removeClass:U,setClass:Et,getClass:Dt,setOpacity:Ot,testProp:At,setTransform:jt,setPosition:W,getPosition:Mt,get disableTextSelection(){return Nt},get enableTextSelection(){return G},disableImageDrag:It,enableImageDrag:Lt,preventOutline:Bt,restoreOutline:Vt,getSizedParentNode:Ht,getScale:Ut};function K(e,t,n,r){if(t&&typeof t==`object`)for(var i in t)Jt(e,i,t[i],n);else{t=f(t);for(var a=0,o=t.length;a<o;a++)Jt(e,t[a],n,r)}return this}var Gt=`_leaflet_events`;function q(e,t,n,r){if(arguments.length===1)Kt(e),delete e[Gt];else if(t&&typeof t==`object`)for(var i in t)Yt(e,i,t[i],n);else if(t=f(t),arguments.length===2)Kt(e,function(e){return ee(t,e)!==-1});else for(var a=0,o=t.length;a<o;a++)Yt(e,t[a],n,r);return this}function Kt(e,t){for(var n in e[Gt]){var r=n.split(/\d/)[0];(!t||t(r))&&Yt(e,r,null,null,n)}}var qt={mouseenter:`mouseover`,mouseleave:`mouseout`,wheel:!(`onwheel`in window)&&`mousewheel`};function Jt(e,t,n,r){var i=t+o(n)+(r?`_`+o(r):``);if(e[Gt]&&e[Gt][i])return this;var a=function(t){return n.call(r||e,t||window.event)},s=a;!z.touchNative&&z.pointer&&t.indexOf(`touch`)===0?a=at(e,t,a):z.touch&&t===`dblclick`?a=ht(e,a):`addEventListener`in e?t===`touchstart`||t===`touchmove`||t===`wheel`||t===`mousewheel`?e.addEventListener(qt[t]||t,a,z.passiveEvents?{passive:!1}:!1):t===`mouseenter`||t===`mouseleave`?(a=function(t){t||=window.event,an(e,t)&&s(t)},e.addEventListener(qt[t],a,!1)):e.addEventListener(t,s,!1):e.attachEvent(`on`+t,a),e[Gt]=e[Gt]||{},e[Gt][i]=a}function Yt(e,t,n,r,i){i||=t+o(n)+(r?`_`+o(r):``);var a=e[Gt]&&e[Gt][i];if(!a)return this;!z.touchNative&&z.pointer&&t.indexOf(`touch`)===0?ot(e,t,a):z.touch&&t===`dblclick`?gt(e,a):`removeEventListener`in e?e.removeEventListener(qt[t]||t,a,!1):e.detachEvent(`on`+t,a),e[Gt][i]=null}function Xt(e){return e.stopPropagation?e.stopPropagation():e.originalEvent?e.originalEvent._stopped=!0:e.cancelBubble=!0,this}function Zt(e){return Jt(e,`wheel`,Xt),this}function Qt(e){return K(e,`mousedown touchstart dblclick contextmenu`,Xt),e._leaflet_disable_click=!0,this}function J(e){return e.preventDefault?e.preventDefault():e.returnValue=!1,this}function $t(e){return J(e),Xt(e),this}function en(e){if(e.composedPath)return e.composedPath();for(var t=[],n=e.target;n;)t.push(n),n=n.parentNode;return t}function tn(e,t){if(!t)return new E(e.clientX,e.clientY);var n=Ut(t),r=n.boundingClientRect;return new E((e.clientX-r.left)/n.x-t.clientLeft,(e.clientY-r.top)/n.y-t.clientTop)}var nn=z.linux&&z.chrome?window.devicePixelRatio:z.mac?window.devicePixelRatio*3:window.devicePixelRatio>0?2*window.devicePixelRatio:1;function rn(e){return z.edge?e.wheelDeltaY/2:e.deltaY&&e.deltaMode===0?-e.deltaY/nn:e.deltaY&&e.deltaMode===1?-e.deltaY*20:e.deltaY&&e.deltaMode===2?-e.deltaY*60:e.deltaX||e.deltaZ?0:e.wheelDelta?(e.wheelDeltaY||e.wheelDelta)/2:e.detail&&Math.abs(e.detail)<32765?-e.detail*20:e.detail?e.detail/-32765*60:0}function an(e,t){var n=t.relatedTarget;if(!n)return!0;try{for(;n&&n!==e;)n=n.parentNode}catch{return!1}return n!==e}var on={__proto__:null,on:K,off:q,stopPropagation:Xt,disableScrollPropagation:Zt,disableClickPropagation:Qt,preventDefault:J,stop:$t,getPropagationPath:en,getMousePosition:tn,getWheelDelta:rn,isExternalTarget:an,addListener:K,removeListener:q},sn=T.extend({run:function(e,t,n,r){this.stop(),this._el=e,this._inProgress=!0,this._duration=n||.25,this._easeOutPower=1/Math.max(r||.5,.2),this._startPos=Mt(e),this._offset=t.subtract(this._startPos),this._startTime=+new Date,this.fire(`start`),this._animate()},stop:function(){this._inProgress&&(this._step(!0),this._complete())},_animate:function(){this._animId=x(this._animate,this),this._step()},_step:function(e){var t=+new Date-this._startTime,n=this._duration*1e3;t<n?this._runFrame(this._easeOut(t/n),e):(this._runFrame(1),this._complete())},_runFrame:function(e,t){var n=this._startPos.add(this._offset.multiplyBy(e));t&&n._round(),W(this._el,n),this.fire(`step`)},_complete:function(){S(this._animId),this._inProgress=!1,this.fire(`end`)},_easeOut:function(e){return 1-(1-e)**this._easeOutPower}}),Y=T.extend({options:{crs:fe,center:void 0,zoom:void 0,minZoom:void 0,maxZoom:void 0,layers:[],maxBounds:void 0,renderer:void 0,zoomAnimation:!0,zoomAnimationThreshold:4,fadeAnimation:!0,markerZoomAnimation:!0,transform3DLimit:8388608,zoomSnap:1,zoomDelta:1,trackResize:!0},initialize:function(e,t){t=p(this,t),this._handlers=[],this._layers={},this._zoomBoundLayers={},this._sizeChanged=!0,this._initContainer(e),this._initLayout(),this._onResize=i(this._onResize,this),this._initEvents(),t.maxBounds&&this.setMaxBounds(t.maxBounds),t.zoom!==void 0&&(this._zoom=this._limitZoom(t.zoom)),t.center&&t.zoom!==void 0&&this.setView(N(t.center),t.zoom,{reset:!0}),this.callInitHooks(),this._zoomAnimated=vt&&z.any3d&&!z.mobileOpera&&this.options.zoomAnimation,this._zoomAnimated&&(this._createAnimProxy(),K(this._proxy,yt,this._catchTransitionEnd,this)),this._addLayers(this.options.layers)},setView:function(e,t,r){return t=t===void 0?this._zoom:this._limitZoom(t),e=this._limitCenter(N(e),t,this.options.maxBounds),r||={},this._stop(),this._loaded&&!r.reset&&r!==!0&&(r.animate!==void 0&&(r.zoom=n({animate:r.animate},r.zoom),r.pan=n({animate:r.animate,duration:r.duration},r.pan)),this._zoom===t?this._tryAnimatedPan(e,r.pan):this._tryAnimatedZoom&&this._tryAnimatedZoom(e,t,r.zoom))?(clearTimeout(this._sizeTimer),this):(this._resetView(e,t,r.pan&&r.pan.noMoveStart),this)},setZoom:function(e,t){return this._loaded?this.setView(this.getCenter(),e,{zoom:t}):(this._zoom=e,this)},zoomIn:function(e,t){return e||=z.any3d?this.options.zoomDelta:1,this.setZoom(this._zoom+e,t)},zoomOut:function(e,t){return e||=z.any3d?this.options.zoomDelta:1,this.setZoom(this._zoom-e,t)},setZoomAround:function(e,t,n){var r=this.getZoomScale(t),i=this.getSize().divideBy(2),a=(e instanceof E?e:this.latLngToContainerPoint(e)).subtract(i).multiplyBy(1-1/r),o=this.containerPointToLatLng(i.add(a));return this.setView(o,t,{zoom:n})},_getBoundsCenterZoom:function(e,t){t||={},e=e.getBounds?e.getBounds():j(e);var n=D(t.paddingTopLeft||t.padding||[0,0]),r=D(t.paddingBottomRight||t.padding||[0,0]),i=this.getBoundsZoom(e,!1,n.add(r));if(i=typeof t.maxZoom==`number`?Math.min(t.maxZoom,i):i,i===1/0)return{center:e.getCenter(),zoom:i};var a=r.subtract(n).divideBy(2),o=this.project(e.getSouthWest(),i),s=this.project(e.getNorthEast(),i);return{center:this.unproject(o.add(s).divideBy(2).add(a),i),zoom:i}},fitBounds:function(e,t){if(e=j(e),!e.isValid())throw Error(`Bounds are not valid.`);var n=this._getBoundsCenterZoom(e,t);return this.setView(n.center,n.zoom,t)},fitWorld:function(e){return this.fitBounds([[-90,-180],[90,180]],e)},panTo:function(e,t){return this.setView(e,this._zoom,{pan:t})},panBy:function(e,t){if(e=D(e).round(),t||={},!e.x&&!e.y)return this.fire(`moveend`);if(t.animate!==!0&&!this.getSize().contains(e))return this._resetView(this.unproject(this.project(this.getCenter()).add(e)),this.getZoom()),this;if(this._panAnim||(this._panAnim=new sn,this._panAnim.on({step:this._onPanTransitionStep,end:this._onPanTransitionEnd},this)),t.noMoveStart||this.fire(`movestart`),t.animate!==!1){H(this._mapPane,`leaflet-pan-anim`);var n=this._getMapPanePos().subtract(e).round();this._panAnim.run(this._mapPane,n,t.duration||.25,t.easeLinearity)}else this._rawPanBy(e),this.fire(`move`).fire(`moveend`);return this},flyTo:function(e,t,n){if(n||={},n.animate===!1||!z.any3d)return this.setView(e,t,n);this._stop();var r=this.project(this.getCenter()),i=this.project(e),a=this.getSize(),o=this._zoom;e=N(e),t=t===void 0?o:t;var s=Math.max(a.x,a.y),c=s*this.getZoomScale(o,t),l=i.distanceTo(r)||1,u=1.42,d=u*u;function f(e){var t=e?-1:1,n=e?c:s,r=(c*c-s*s+t*d*d*l*l)/(2*n*d*l),i=Math.sqrt(r*r+1)-r;return i<1e-9?-18:Math.log(i)}function p(e){return(Math.exp(e)-Math.exp(-e))/2}function m(e){return(Math.exp(e)+Math.exp(-e))/2}function h(e){return p(e)/m(e)}var g=f(0);function _(e){return s*(m(g)/m(g+u*e))}function ee(e){return s*(m(g)*h(g+u*e)-p(g))/d}function te(e){return 1-(1-e)**1.5}var v=Date.now(),y=(f(1)-g)/u,ne=n.duration?1e3*n.duration:1e3*y*.8;function b(){var n=(Date.now()-v)/ne,a=te(n)*y;n<=1?(this._flyToFrame=x(b,this),this._move(this.unproject(r.add(i.subtract(r).multiplyBy(ee(a)/l)),o),this.getScaleZoom(s/_(a),o),{flyTo:!0})):this._move(e,t)._moveEnd(!0)}return this._moveStart(!0,n.noMoveStart),b.call(this),this},flyToBounds:function(e,t){var n=this._getBoundsCenterZoom(e,t);return this.flyTo(n.center,n.zoom,t)},setMaxBounds:function(e){return e=j(e),this.listens(`moveend`,this._panInsideMaxBounds)&&this.off(`moveend`,this._panInsideMaxBounds),e.isValid()?(this.options.maxBounds=e,this._loaded&&this._panInsideMaxBounds(),this.on(`moveend`,this._panInsideMaxBounds)):(this.options.maxBounds=null,this)},setMinZoom:function(e){var t=this.options.minZoom;return this.options.minZoom=e,this._loaded&&t!==e&&(this.fire(`zoomlevelschange`),this.getZoom()<this.options.minZoom)?this.setZoom(e):this},setMaxZoom:function(e){var t=this.options.maxZoom;return this.options.maxZoom=e,this._loaded&&t!==e&&(this.fire(`zoomlevelschange`),this.getZoom()>this.options.maxZoom)?this.setZoom(e):this},panInsideBounds:function(e,t){this._enforcingBounds=!0;var n=this.getCenter(),r=this._limitCenter(n,this._zoom,j(e));return n.equals(r)||this.panTo(r,t),this._enforcingBounds=!1,this},panInside:function(e,t){t||={};var n=D(t.paddingTopLeft||t.padding||[0,0]),r=D(t.paddingBottomRight||t.padding||[0,0]),i=this.project(this.getCenter()),a=this.project(e),o=this.getPixelBounds(),s=k([o.min.add(n),o.max.subtract(r)]),c=s.getSize();if(!s.contains(a)){this._enforcingBounds=!0;var l=a.subtract(s.getCenter()),u=s.extend(a).getSize().subtract(c);i.x+=l.x<0?-u.x:u.x,i.y+=l.y<0?-u.y:u.y,this.panTo(this.unproject(i),t),this._enforcingBounds=!1}return this},invalidateSize:function(e){if(!this._loaded)return this;e=n({animate:!1,pan:!0},e===!0?{animate:!0}:e);var t=this.getSize();this._sizeChanged=!0,this._lastCenter=null;var r=this.getSize(),a=t.divideBy(2).round(),o=r.divideBy(2).round(),s=a.subtract(o);return!s.x&&!s.y?this:(e.animate&&e.pan?this.panBy(s):(e.pan&&this._rawPanBy(s),this.fire(`move`),e.debounceMoveend?(clearTimeout(this._sizeTimer),this._sizeTimer=setTimeout(i(this.fire,this,`moveend`),200)):this.fire(`moveend`)),this.fire(`resize`,{oldSize:t,newSize:r}))},stop:function(){return this.setZoom(this._limitZoom(this._zoom)),this.options.zoomSnap||this.fire(`viewreset`),this._stop()},locate:function(e){if(e=this._locateOptions=n({timeout:1e4,watch:!1},e),!(`geolocation`in navigator))return this._handleGeolocationError({code:0,message:`Geolocation not supported.`}),this;var t=i(this._handleGeolocationResponse,this),r=i(this._handleGeolocationError,this);return e.watch?this._locationWatchId=navigator.geolocation.watchPosition(t,r,e):navigator.geolocation.getCurrentPosition(t,r,e),this},stopLocate:function(){return navigator.geolocation&&navigator.geolocation.clearWatch&&navigator.geolocation.clearWatch(this._locationWatchId),this._locateOptions&&(this._locateOptions.setView=!1),this},_handleGeolocationError:function(e){if(this._container._leaflet_id){var t=e.code,n=e.message||(t===1?`permission denied`:t===2?`position unavailable`:`timeout`);this._locateOptions.setView&&!this._loaded&&this.fitWorld(),this.fire(`locationerror`,{code:t,message:`Geolocation error: `+n+`.`})}},_handleGeolocationResponse:function(e){if(this._container._leaflet_id){var t=e.coords.latitude,n=e.coords.longitude,r=new M(t,n),i=r.toBounds(e.coords.accuracy*2),a=this._locateOptions;if(a.setView){var o=this.getBoundsZoom(i);this.setView(r,a.maxZoom?Math.min(o,a.maxZoom):o)}var s={latlng:r,bounds:i,timestamp:e.timestamp};for(var c in e.coords)typeof e.coords[c]==`number`&&(s[c]=e.coords[c]);this.fire(`locationfound`,s)}},addHandler:function(e,t){if(!t)return this;var n=this[e]=new t(this);return this._handlers.push(n),this.options[e]&&n.enable(),this},remove:function(){if(this._initEvents(!0),this.options.maxBounds&&this.off(`moveend`,this._panInsideMaxBounds),this._containerId!==this._container._leaflet_id)throw Error(`Map container is being reused by another instance`);try{delete this._container._leaflet_id,delete this._containerId}catch{this._container._leaflet_id=void 0,this._containerId=void 0}for(var e in this._locationWatchId!==void 0&&this.stopLocate(),this._stop(),V(this._mapPane),this._clearControlPos&&this._clearControlPos(),this._resizeRequest&&=(S(this._resizeRequest),null),this._clearHandlers(),this._loaded&&this.fire(`unload`),this._layers)this._layers[e].remove();for(e in this._panes)V(this._panes[e]);return this._layers=[],this._panes=[],delete this._mapPane,delete this._renderer,this},createPane:function(e,t){var n=B(`div`,`leaflet-pane`+(e?` leaflet-`+e.replace(`Pane`,``)+`-pane`:``),t||this._mapPane);return e&&(this._panes[e]=n),n},getCenter:function(){return this._checkIfLoaded(),this._lastCenter&&!this._moved()?this._lastCenter.clone():this.layerPointToLatLng(this._getCenterLayerPoint())},getZoom:function(){return this._zoom},getBounds:function(){var e=this.getPixelBounds();return new A(this.unproject(e.getBottomLeft()),this.unproject(e.getTopRight()))},getMinZoom:function(){return this.options.minZoom===void 0?this._layersMinZoom||0:this.options.minZoom},getMaxZoom:function(){return this.options.maxZoom===void 0?this._layersMaxZoom===void 0?1/0:this._layersMaxZoom:this.options.maxZoom},getBoundsZoom:function(e,t,n){e=j(e),n=D(n||[0,0]);var r=this.getZoom()||0,i=this.getMinZoom(),a=this.getMaxZoom(),o=e.getNorthWest(),s=e.getSouthEast(),c=this.getSize().subtract(n),l=k(this.project(s,r),this.project(o,r)).getSize(),u=z.any3d?this.options.zoomSnap:1,d=c.x/l.x,f=c.y/l.y,p=t?Math.max(d,f):Math.min(d,f);return r=this.getScaleZoom(p,r),u&&(r=Math.round(r/(u/100))*(u/100),r=t?Math.ceil(r/u)*u:Math.floor(r/u)*u),Math.max(i,Math.min(a,r))},getSize:function(){return(!this._size||this._sizeChanged)&&(this._size=new E(this._container.clientWidth||0,this._container.clientHeight||0),this._sizeChanged=!1),this._size.clone()},getPixelBounds:function(e,t){var n=this._getTopLeftPoint(e,t);return new O(n,n.add(this.getSize()))},getPixelOrigin:function(){return this._checkIfLoaded(),this._pixelOrigin},getPixelWorldBounds:function(e){return this.options.crs.getProjectedBounds(e===void 0?this.getZoom():e)},getPane:function(e){return typeof e==`string`?this._panes[e]:e},getPanes:function(){return this._panes},getContainer:function(){return this._container},getZoomScale:function(e,t){var n=this.options.crs;return t=t===void 0?this._zoom:t,n.scale(e)/n.scale(t)},getScaleZoom:function(e,t){var n=this.options.crs;t=t===void 0?this._zoom:t;var r=n.zoom(e*n.scale(t));return isNaN(r)?1/0:r},project:function(e,t){return t=t===void 0?this._zoom:t,this.options.crs.latLngToPoint(N(e),t)},unproject:function(e,t){return t=t===void 0?this._zoom:t,this.options.crs.pointToLatLng(D(e),t)},layerPointToLatLng:function(e){var t=D(e).add(this.getPixelOrigin());return this.unproject(t)},latLngToLayerPoint:function(e){return this.project(N(e))._round()._subtract(this.getPixelOrigin())},wrapLatLng:function(e){return this.options.crs.wrapLatLng(N(e))},wrapLatLngBounds:function(e){return this.options.crs.wrapLatLngBounds(j(e))},distance:function(e,t){return this.options.crs.distance(N(e),N(t))},containerPointToLayerPoint:function(e){return D(e).subtract(this._getMapPanePos())},layerPointToContainerPoint:function(e){return D(e).add(this._getMapPanePos())},containerPointToLatLng:function(e){var t=this.containerPointToLayerPoint(D(e));return this.layerPointToLatLng(t)},latLngToContainerPoint:function(e){return this.layerPointToContainerPoint(this.latLngToLayerPoint(N(e)))},mouseEventToContainerPoint:function(e){return tn(e,this._container)},mouseEventToLayerPoint:function(e){return this.containerPointToLayerPoint(this.mouseEventToContainerPoint(e))},mouseEventToLatLng:function(e){return this.layerPointToLatLng(this.mouseEventToLayerPoint(e))},_initContainer:function(e){var t=this._container=bt(e);if(!t)throw Error(`Map container not found.`);if(t._leaflet_id)throw Error(`Map container is already initialized.`);K(t,`scroll`,this._onScroll,this),this._containerId=o(t)},_initLayout:function(){var e=this._container;this._fadeAnimated=this.options.fadeAnimation&&z.any3d,H(e,`leaflet-container`+(z.touch?` leaflet-touch`:``)+(z.retina?` leaflet-retina`:``)+(z.ielt9?` leaflet-oldie`:``)+(z.safari?` leaflet-safari`:``)+(this._fadeAnimated?` leaflet-fade-anim`:``));var t=xt(e,`position`);t!==`absolute`&&t!==`relative`&&t!==`fixed`&&t!==`sticky`&&(e.style.position=`relative`),this._initPanes(),this._initControlPos&&this._initControlPos()},_initPanes:function(){var e=this._panes={};this._paneRenderers={},this._mapPane=this.createPane(`mapPane`,this._container),W(this._mapPane,new E(0,0)),this.createPane(`tilePane`),this.createPane(`overlayPane`),this.createPane(`shadowPane`),this.createPane(`markerPane`),this.createPane(`tooltipPane`),this.createPane(`popupPane`),this.options.markerZoomAnimation||(H(e.markerPane,`leaflet-zoom-hide`),H(e.shadowPane,`leaflet-zoom-hide`))},_resetView:function(e,t,n){W(this._mapPane,new E(0,0));var r=!this._loaded;this._loaded=!0,t=this._limitZoom(t),this.fire(`viewprereset`);var i=this._zoom!==t;this._moveStart(i,n)._move(e,t)._moveEnd(i),this.fire(`viewreset`),r&&this.fire(`load`)},_moveStart:function(e,t){return e&&this.fire(`zoomstart`),t||this.fire(`movestart`),this},_move:function(e,t,n,r){t===void 0&&(t=this._zoom);var i=this._zoom!==t;return this._zoom=t,this._lastCenter=e,this._pixelOrigin=this._getNewPixelOrigin(e),r?n&&n.pinch&&this.fire(`zoom`,n):((i||n&&n.pinch)&&this.fire(`zoom`,n),this.fire(`move`,n)),this},_moveEnd:function(e){return e&&this.fire(`zoomend`),this.fire(`moveend`)},_stop:function(){return S(this._flyToFrame),this._panAnim&&this._panAnim.stop(),this},_rawPanBy:function(e){W(this._mapPane,this._getMapPanePos().subtract(e))},_getZoomSpan:function(){return this.getMaxZoom()-this.getMinZoom()},_panInsideMaxBounds:function(){this._enforcingBounds||this.panInsideBounds(this.options.maxBounds)},_checkIfLoaded:function(){if(!this._loaded)throw Error(`Set map center and zoom first.`)},_initEvents:function(e){this._targets={},this._targets[o(this._container)]=this;var t=e?q:K;t(this._container,`click dblclick mousedown mouseup mouseover mouseout mousemove contextmenu keypress keydown keyup`,this._handleDOMEvent,this),this.options.trackResize&&t(window,`resize`,this._onResize,this),z.any3d&&this.options.transform3DLimit&&(e?this.off:this.on).call(this,`moveend`,this._onMoveEnd)},_onResize:function(){S(this._resizeRequest),this._resizeRequest=x(function(){this.invalidateSize({debounceMoveend:!0})},this)},_onScroll:function(){this._container.scrollTop=0,this._container.scrollLeft=0},_onMoveEnd:function(){var e=this._getMapPanePos();Math.max(Math.abs(e.x),Math.abs(e.y))>=this.options.transform3DLimit&&this._resetView(this.getCenter(),this.getZoom())},_findEventTargets:function(e,t){for(var n=[],r,i=t===`mouseout`||t===`mouseover`,a=e.target||e.srcElement,s=!1;a;){if(r=this._targets[o(a)],r&&(t===`click`||t===`preclick`)&&this._draggableMoved(r)){s=!0;break}if(r&&r.listens(t,!0)&&(i&&!an(a,e)||(n.push(r),i))||a===this._container)break;a=a.parentNode}return!n.length&&!s&&!i&&this.listens(t,!0)&&(n=[this]),n},_isClickDisabled:function(e){for(;e&&e!==this._container;){if(e._leaflet_disable_click)return!0;e=e.parentNode}},_handleDOMEvent:function(e){var t=e.target||e.srcElement;if(!(!this._loaded||t._leaflet_disable_events||e.type===`click`&&this._isClickDisabled(t))){var n=e.type;n===`mousedown`&&Bt(t),this._fireDOMEvent(e,n)}},_mouseEvents:[`click`,`dblclick`,`mouseover`,`mouseout`,`contextmenu`],_fireDOMEvent:function(e,t,r){if(e.type===`click`){var i=n({},e);i.type=`preclick`,this._fireDOMEvent(i,i.type,r)}var a=this._findEventTargets(e,t);if(r){for(var o=[],s=0;s<r.length;s++)r[s].listens(t,!0)&&o.push(r[s]);a=o.concat(a)}if(a.length){t===`contextmenu`&&J(e);var c=a[0],l={originalEvent:e};if(e.type!==`keypress`&&e.type!==`keydown`&&e.type!==`keyup`){var u=c.getLatLng&&(!c._radius||c._radius<=10);l.containerPoint=u?this.latLngToContainerPoint(c.getLatLng()):this.mouseEventToContainerPoint(e),l.layerPoint=this.containerPointToLayerPoint(l.containerPoint),l.latlng=u?c.getLatLng():this.layerPointToLatLng(l.layerPoint)}for(s=0;s<a.length;s++)if(a[s].fire(t,l,!0),l.originalEvent._stopped||a[s].options.bubblingMouseEvents===!1&&ee(this._mouseEvents,t)!==-1)return}},_draggableMoved:function(e){return e=e.dragging&&e.dragging.enabled()?e:this,e.dragging&&e.dragging.moved()||this.boxZoom&&this.boxZoom.moved()},_clearHandlers:function(){for(var e=0,t=this._handlers.length;e<t;e++)this._handlers[e].disable()},whenReady:function(e,t){return this._loaded?e.call(t||this,{target:this}):this.on(`load`,e,t),this},_getMapPanePos:function(){return Mt(this._mapPane)||new E(0,0)},_moved:function(){var e=this._getMapPanePos();return e&&!e.equals([0,0])},_getTopLeftPoint:function(e,t){return(e&&t!==void 0?this._getNewPixelOrigin(e,t):this.getPixelOrigin()).subtract(this._getMapPanePos())},_getNewPixelOrigin:function(e,t){var n=this.getSize()._divideBy(2);return this.project(e,t)._subtract(n)._add(this._getMapPanePos())._round()},_latLngToNewLayerPoint:function(e,t,n){var r=this._getNewPixelOrigin(n,t);return this.project(e,t)._subtract(r)},_latLngBoundsToNewLayerBounds:function(e,t,n){var r=this._getNewPixelOrigin(n,t);return k([this.project(e.getSouthWest(),t)._subtract(r),this.project(e.getNorthWest(),t)._subtract(r),this.project(e.getSouthEast(),t)._subtract(r),this.project(e.getNorthEast(),t)._subtract(r)])},_getCenterLayerPoint:function(){return this.containerPointToLayerPoint(this.getSize()._divideBy(2))},_getCenterOffset:function(e){return this.latLngToLayerPoint(e).subtract(this._getCenterLayerPoint())},_limitCenter:function(e,t,n){if(!n)return e;var r=this.project(e,t),i=this.getSize().divideBy(2),a=new O(r.subtract(i),r.add(i)),o=this._getBoundsOffset(a,n,t);return Math.abs(o.x)<=1&&Math.abs(o.y)<=1?e:this.unproject(r.add(o),t)},_limitOffset:function(e,t){if(!t)return e;var n=this.getPixelBounds(),r=new O(n.min.add(e),n.max.add(e));return e.add(this._getBoundsOffset(r,t))},_getBoundsOffset:function(e,t,n){var r=k(this.project(t.getNorthEast(),n),this.project(t.getSouthWest(),n)),i=r.min.subtract(e.min),a=r.max.subtract(e.max);return new E(this._rebound(i.x,-a.x),this._rebound(i.y,-a.y))},_rebound:function(e,t){return e+t>0?Math.round(e-t)/2:Math.max(0,Math.ceil(e))-Math.max(0,Math.floor(t))},_limitZoom:function(e){var t=this.getMinZoom(),n=this.getMaxZoom(),r=z.any3d?this.options.zoomSnap:1;return r&&(e=Math.round(e/r)*r),Math.max(t,Math.min(n,e))},_onPanTransitionStep:function(){this.fire(`move`)},_onPanTransitionEnd:function(){U(this._mapPane,`leaflet-pan-anim`),this.fire(`moveend`)},_tryAnimatedPan:function(e,t){var n=this._getCenterOffset(e)._trunc();return(t&&t.animate)!==!0&&!this.getSize().contains(n)?!1:(this.panBy(n,t),!0)},_createAnimProxy:function(){var e=this._proxy=B(`div`,`leaflet-proxy leaflet-zoom-animated`);this._panes.mapPane.appendChild(e),this.on(`zoomanim`,function(e){var t=_t,n=this._proxy.style[t];jt(this._proxy,this.project(e.center,e.zoom),this.getZoomScale(e.zoom,1)),n===this._proxy.style[t]&&this._animatingZoom&&this._onZoomTransitionEnd()},this),this.on(`load moveend`,this._animMoveEnd,this),this._on(`unload`,this._destroyAnimProxy,this)},_destroyAnimProxy:function(){V(this._proxy),this.off(`load moveend`,this._animMoveEnd,this),delete this._proxy},_animMoveEnd:function(){var e=this.getCenter(),t=this.getZoom();jt(this._proxy,this.project(e,t),this.getZoomScale(t,1))},_catchTransitionEnd:function(e){this._animatingZoom&&e.propertyName.indexOf(`transform`)>=0&&this._onZoomTransitionEnd()},_nothingToAnimate:function(){return!this._container.getElementsByClassName(`leaflet-zoom-animated`).length},_tryAnimatedZoom:function(e,t,n){if(this._animatingZoom)return!0;if(n||={},!this._zoomAnimated||n.animate===!1||this._nothingToAnimate()||Math.abs(t-this._zoom)>this.options.zoomAnimationThreshold)return!1;var r=this.getZoomScale(t),i=this._getCenterOffset(e)._divideBy(1-1/r);return n.animate!==!0&&!this.getSize().contains(i)?!1:(x(function(){this._moveStart(!0,n.noMoveStart||!1)._animateZoom(e,t,!0)},this),!0)},_animateZoom:function(e,t,n,r){this._mapPane&&(n&&(this._animatingZoom=!0,this._animateToCenter=e,this._animateToZoom=t,H(this._mapPane,`leaflet-zoom-anim`)),this.fire(`zoomanim`,{center:e,zoom:t,noUpdate:r}),this._tempFireZoomEvent||=this._zoom!==this._animateToZoom,this._move(this._animateToCenter,this._animateToZoom,void 0,!0),setTimeout(i(this._onZoomTransitionEnd,this),250))},_onZoomTransitionEnd:function(){this._animatingZoom&&(this._mapPane&&U(this._mapPane,`leaflet-zoom-anim`),this._animatingZoom=!1,this._move(this._animateToCenter,this._animateToZoom,void 0,!0),this._tempFireZoomEvent&&this.fire(`zoom`),delete this._tempFireZoomEvent,this.fire(`move`),this._moveEnd(!0))}});function cn(e,t){return new Y(e,t)}var ln=C.extend({options:{position:`topright`},initialize:function(e){p(this,e)},getPosition:function(){return this.options.position},setPosition:function(e){var t=this._map;return t&&t.removeControl(this),this.options.position=e,t&&t.addControl(this),this},getContainer:function(){return this._container},addTo:function(e){this.remove(),this._map=e;var t=this._container=this.onAdd(e),n=this.getPosition(),r=e._controlCorners[n];return H(t,`leaflet-control`),n.indexOf(`bottom`)===-1?r.appendChild(t):r.insertBefore(t,r.firstChild),this._map.on(`unload`,this.remove,this),this},remove:function(){return this._map?(V(this._container),this.onRemove&&this.onRemove(this._map),this._map.off(`unload`,this.remove,this),this._map=null,this):this},_refocusOnMap:function(e){this._map&&e&&e.screenX>0&&e.screenY>0&&this._map.getContainer().focus()}}),un=function(e){return new ln(e)};Y.include({addControl:function(e){return e.addTo(this),this},removeControl:function(e){return e.remove(),this},_initControlPos:function(){var e=this._controlCorners={},t=`leaflet-`,n=this._controlContainer=B(`div`,t+`control-container`,this._container);function r(r,i){var a=t+r+` `+t+i;e[r+i]=B(`div`,a,n)}r(`top`,`left`),r(`top`,`right`),r(`bottom`,`left`),r(`bottom`,`right`)},_clearControlPos:function(){for(var e in this._controlCorners)V(this._controlCorners[e]);V(this._controlContainer),delete this._controlCorners,delete this._controlContainer}});var dn=ln.extend({options:{collapsed:!0,position:`topright`,autoZIndex:!0,hideSingleBase:!1,sortLayers:!1,sortFunction:function(e,t,n,r){return n<r?-1:+(r<n)}},initialize:function(e,t,n){for(var r in p(this,n),this._layerControlInputs=[],this._layers=[],this._lastZIndex=0,this._handlingClick=!1,this._preventClick=!1,e)this._addLayer(e[r],r);for(r in t)this._addLayer(t[r],r,!0)},onAdd:function(e){this._initLayout(),this._update(),this._map=e,e.on(`zoomend`,this._checkDisabledLayers,this);for(var t=0;t<this._layers.length;t++)this._layers[t].layer.on(`add remove`,this._onLayerChange,this);return this._container},addTo:function(e){return ln.prototype.addTo.call(this,e),this._expandIfNotCollapsed()},onRemove:function(){this._map.off(`zoomend`,this._checkDisabledLayers,this);for(var e=0;e<this._layers.length;e++)this._layers[e].layer.off(`add remove`,this._onLayerChange,this)},addBaseLayer:function(e,t){return this._addLayer(e,t),this._map?this._update():this},addOverlay:function(e,t){return this._addLayer(e,t,!0),this._map?this._update():this},removeLayer:function(e){e.off(`add remove`,this._onLayerChange,this);var t=this._getLayer(o(e));return t&&this._layers.splice(this._layers.indexOf(t),1),this._map?this._update():this},expand:function(){H(this._container,`leaflet-control-layers-expanded`),this._section.style.height=null;var e=this._map.getSize().y-(this._container.offsetTop+50);return e<this._section.clientHeight?(H(this._section,`leaflet-control-layers-scrollbar`),this._section.style.height=e+`px`):U(this._section,`leaflet-control-layers-scrollbar`),this._checkDisabledLayers(),this},collapse:function(){return U(this._container,`leaflet-control-layers-expanded`),this},_initLayout:function(){var e=`leaflet-control-layers`,t=this._container=B(`div`,e),n=this.options.collapsed;t.setAttribute(`aria-haspopup`,!0),Qt(t),Zt(t);var r=this._section=B(`section`,e+`-list`);n&&(this._map.on(`click`,this.collapse,this),K(t,{mouseenter:this._expandSafely,mouseleave:this.collapse},this));var i=this._layersLink=B(`a`,e+`-toggle`,t);i.href=`#`,i.title=`Layers`,i.setAttribute(`role`,`button`),K(i,{keydown:function(e){e.keyCode===13&&this._expandSafely()},click:function(e){J(e),this._expandSafely()}},this),n||this.expand(),this._baseLayersList=B(`div`,e+`-base`,r),this._separator=B(`div`,e+`-separator`,r),this._overlaysList=B(`div`,e+`-overlays`,r),t.appendChild(r)},_getLayer:function(e){for(var t=0;t<this._layers.length;t++)if(this._layers[t]&&o(this._layers[t].layer)===e)return this._layers[t]},_addLayer:function(e,t,n){this._map&&e.on(`add remove`,this._onLayerChange,this),this._layers.push({layer:e,name:t,overlay:n}),this.options.sortLayers&&this._layers.sort(i(function(e,t){return this.options.sortFunction(e.layer,t.layer,e.name,t.name)},this)),this.options.autoZIndex&&e.setZIndex&&(this._lastZIndex++,e.setZIndex(this._lastZIndex)),this._expandIfNotCollapsed()},_update:function(){if(!this._container)return this;St(this._baseLayersList),St(this._overlaysList),this._layerControlInputs=[];var e,t,n,r,i=0;for(n=0;n<this._layers.length;n++)r=this._layers[n],this._addItem(r),t||=r.overlay,e||=!r.overlay,i+=+!r.overlay;return this.options.hideSingleBase&&(e&&=i>1,this._baseLayersList.style.display=e?``:`none`),this._separator.style.display=t&&e?``:`none`,this},_onLayerChange:function(e){this._handlingClick||this._update();var t=this._getLayer(o(e.target)),n=t.overlay?e.type===`add`?`overlayadd`:`overlayremove`:e.type===`add`?`baselayerchange`:null;n&&this._map.fire(n,t)},_createRadioElement:function(e,t){var n=`<input type="radio" class="leaflet-control-layers-selector" name="`+e+`"`+(t?` checked="checked"`:``)+`/>`,r=document.createElement(`div`);return r.innerHTML=n,r.firstChild},_addItem:function(e){var t=document.createElement(`label`),n=this._map.hasLayer(e.layer),r;e.overlay?(r=document.createElement(`input`),r.type=`checkbox`,r.className=`leaflet-control-layers-selector`,r.defaultChecked=n):r=this._createRadioElement(`leaflet-base-layers_`+o(this),n),this._layerControlInputs.push(r),r.layerId=o(e.layer),K(r,`click`,this._onInputClick,this);var i=document.createElement(`span`);i.innerHTML=` `+e.name;var a=document.createElement(`span`);return t.appendChild(a),a.appendChild(r),a.appendChild(i),(e.overlay?this._overlaysList:this._baseLayersList).appendChild(t),this._checkDisabledLayers(),t},_onInputClick:function(){if(!this._preventClick){var e=this._layerControlInputs,t,n,r=[],i=[];this._handlingClick=!0;for(var a=e.length-1;a>=0;a--)t=e[a],n=this._getLayer(t.layerId).layer,t.checked?r.push(n):t.checked||i.push(n);for(a=0;a<i.length;a++)this._map.hasLayer(i[a])&&this._map.removeLayer(i[a]);for(a=0;a<r.length;a++)this._map.hasLayer(r[a])||this._map.addLayer(r[a]);this._handlingClick=!1,this._refocusOnMap()}},_checkDisabledLayers:function(){for(var e=this._layerControlInputs,t,n,r=this._map.getZoom(),i=e.length-1;i>=0;i--)t=e[i],n=this._getLayer(t.layerId).layer,t.disabled=n.options.minZoom!==void 0&&r<n.options.minZoom||n.options.maxZoom!==void 0&&r>n.options.maxZoom},_expandIfNotCollapsed:function(){return this._map&&!this.options.collapsed&&this.expand(),this},_expandSafely:function(){var e=this._section;this._preventClick=!0,K(e,`click`,J),this.expand();var t=this;setTimeout(function(){q(e,`click`,J),t._preventClick=!1})}}),fn=function(e,t,n){return new dn(e,t,n)},pn=ln.extend({options:{position:`topleft`,zoomInText:`<span aria-hidden="true">+</span>`,zoomInTitle:`Zoom in`,zoomOutText:`<span aria-hidden="true">&#x2212;</span>`,zoomOutTitle:`Zoom out`},onAdd:function(e){var t=`leaflet-control-zoom`,n=B(`div`,t+` leaflet-bar`),r=this.options;return this._zoomInButton=this._createButton(r.zoomInText,r.zoomInTitle,t+`-in`,n,this._zoomIn),this._zoomOutButton=this._createButton(r.zoomOutText,r.zoomOutTitle,t+`-out`,n,this._zoomOut),this._updateDisabled(),e.on(`zoomend zoomlevelschange`,this._updateDisabled,this),n},onRemove:function(e){e.off(`zoomend zoomlevelschange`,this._updateDisabled,this)},disable:function(){return this._disabled=!0,this._updateDisabled(),this},enable:function(){return this._disabled=!1,this._updateDisabled(),this},_zoomIn:function(e){!this._disabled&&this._map._zoom<this._map.getMaxZoom()&&this._map.zoomIn(this._map.options.zoomDelta*(e.shiftKey?3:1))},_zoomOut:function(e){!this._disabled&&this._map._zoom>this._map.getMinZoom()&&this._map.zoomOut(this._map.options.zoomDelta*(e.shiftKey?3:1))},_createButton:function(e,t,n,r,i){var a=B(`a`,n,r);return a.innerHTML=e,a.href=`#`,a.title=t,a.setAttribute(`role`,`button`),a.setAttribute(`aria-label`,t),Qt(a),K(a,`click`,$t),K(a,`click`,i,this),K(a,`click`,this._refocusOnMap,this),a},_updateDisabled:function(){var e=this._map,t=`leaflet-disabled`;U(this._zoomInButton,t),U(this._zoomOutButton,t),this._zoomInButton.setAttribute(`aria-disabled`,`false`),this._zoomOutButton.setAttribute(`aria-disabled`,`false`),(this._disabled||e._zoom===e.getMinZoom())&&(H(this._zoomOutButton,t),this._zoomOutButton.setAttribute(`aria-disabled`,`true`)),(this._disabled||e._zoom===e.getMaxZoom())&&(H(this._zoomInButton,t),this._zoomInButton.setAttribute(`aria-disabled`,`true`))}});Y.mergeOptions({zoomControl:!0}),Y.addInitHook(function(){this.options.zoomControl&&(this.zoomControl=new pn,this.addControl(this.zoomControl))});var mn=function(e){return new pn(e)},X=ln.extend({options:{position:`bottomleft`,maxWidth:100,metric:!0,imperial:!0},onAdd:function(e){var t=`leaflet-control-scale`,n=B(`div`,t),r=this.options;return this._addScales(r,t+`-line`,n),e.on(r.updateWhenIdle?`moveend`:`move`,this._update,this),e.whenReady(this._update,this),n},onRemove:function(e){e.off(this.options.updateWhenIdle?`moveend`:`move`,this._update,this)},_addScales:function(e,t,n){e.metric&&(this._mScale=B(`div`,t,n)),e.imperial&&(this._iScale=B(`div`,t,n))},_update:function(){var e=this._map,t=e.getSize().y/2,n=e.distance(e.containerPointToLatLng([0,t]),e.containerPointToLatLng([this.options.maxWidth,t]));this._updateScales(n)},_updateScales:function(e){this.options.metric&&e&&this._updateMetric(e),this.options.imperial&&e&&this._updateImperial(e)},_updateMetric:function(e){var t=this._getRoundNum(e),n=t<1e3?t+` m`:t/1e3+` km`;this._updateScale(this._mScale,n,t/e)},_updateImperial:function(e){var t=e*3.2808399,n,r,i;t>5280?(n=t/5280,r=this._getRoundNum(n),this._updateScale(this._iScale,r+` mi`,r/n)):(i=this._getRoundNum(t),this._updateScale(this._iScale,i+` ft`,i/t))},_updateScale:function(e,t,n){e.style.width=Math.round(this.options.maxWidth*n)+`px`,e.innerHTML=t},_getRoundNum:function(e){var t=10**((Math.floor(e)+``).length-1),n=e/t;return n=n>=10?10:n>=5?5:n>=3?3:n>=2?2:1,t*n}}),hn=function(e){return new X(e)},gn=ln.extend({options:{position:`bottomright`,prefix:`<a href="https://leafletjs.com" title="A JavaScript library for interactive maps">`+(z.inlineSvg?`<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="12" height="8" viewBox="0 0 12 8" class="leaflet-attribution-flag"><path fill="#4C7BE1" d="M0 0h12v4H0z"/><path fill="#FFD500" d="M0 4h12v3H0z"/><path fill="#E0BC00" d="M0 7h12v1H0z"/></svg> `:``)+`Leaflet</a>`},initialize:function(e){p(this,e),this._attributions={}},onAdd:function(e){for(var t in e.attributionControl=this,this._container=B(`div`,`leaflet-control-attribution`),Qt(this._container),e._layers)e._layers[t].getAttribution&&this.addAttribution(e._layers[t].getAttribution());return this._update(),e.on(`layeradd`,this._addAttribution,this),this._container},onRemove:function(e){e.off(`layeradd`,this._addAttribution,this)},_addAttribution:function(e){e.layer.getAttribution&&(this.addAttribution(e.layer.getAttribution()),e.layer.once(`remove`,function(){this.removeAttribution(e.layer.getAttribution())},this))},setPrefix:function(e){return this.options.prefix=e,this._update(),this},addAttribution:function(e){return e?(this._attributions[e]||(this._attributions[e]=0),this._attributions[e]++,this._update(),this):this},removeAttribution:function(e){return e&&this._attributions[e]&&(this._attributions[e]--,this._update()),this},_update:function(){if(this._map){var e=[];for(var t in this._attributions)this._attributions[t]&&e.push(t);var n=[];this.options.prefix&&n.push(this.options.prefix),e.length&&n.push(e.join(`, `)),this._container.innerHTML=n.join(` <span aria-hidden="true">|</span> `)}}});Y.mergeOptions({attributionControl:!0}),Y.addInitHook(function(){this.options.attributionControl&&new gn().addTo(this)}),ln.Layers=dn,ln.Zoom=pn,ln.Scale=X,ln.Attribution=gn,un.layers=fn,un.zoom=mn,un.scale=hn,un.attribution=function(e){return new gn(e)};var Z=C.extend({initialize:function(e){this._map=e},enable:function(){return this._enabled?this:(this._enabled=!0,this.addHooks(),this)},disable:function(){return this._enabled?(this._enabled=!1,this.removeHooks(),this):this},enabled:function(){return!!this._enabled}});Z.addTo=function(e,t){return e.addHandler(t,this),this};var _n={Events:w},vn=z.touch?`touchstart mousedown`:`mousedown`,yn=T.extend({options:{clickTolerance:3},initialize:function(e,t,n,r){p(this,r),this._element=e,this._dragStartTarget=t||e,this._preventOutline=n},enable:function(){this._enabled||=(K(this._dragStartTarget,vn,this._onDown,this),!0)},disable:function(){this._enabled&&(yn._dragging===this&&this.finishDrag(!0),q(this._dragStartTarget,vn,this._onDown,this),this._enabled=!1,this._moved=!1)},_onDown:function(e){if(this._enabled&&(this._moved=!1,!Tt(this._element,`leaflet-zoom-anim`))){if(e.touches&&e.touches.length!==1){yn._dragging===this&&this.finishDrag();return}if(!(yn._dragging||e.shiftKey||e.which!==1&&e.button!==1&&!e.touches)&&(yn._dragging=this,this._preventOutline&&Bt(this._element),It(),Nt(),!this._moving)){this.fire(`down`);var t=e.touches?e.touches[0]:e,n=Ht(this._element);this._startPoint=new E(t.clientX,t.clientY),this._startPos=Mt(this._element),this._parentScale=Ut(n);var r=e.type===`mousedown`;K(document,r?`mousemove`:`touchmove`,this._onMove,this),K(document,r?`mouseup`:`touchend touchcancel`,this._onUp,this)}}},_onMove:function(e){if(this._enabled){if(e.touches&&e.touches.length>1){this._moved=!0;return}var t=e.touches&&e.touches.length===1?e.touches[0]:e,n=new E(t.clientX,t.clientY)._subtract(this._startPoint);!n.x&&!n.y||Math.abs(n.x)+Math.abs(n.y)<this.options.clickTolerance||(n.x/=this._parentScale.x,n.y/=this._parentScale.y,J(e),this._moved||(this.fire(`dragstart`),this._moved=!0,H(document.body,`leaflet-dragging`),this._lastTarget=e.target||e.srcElement,window.SVGElementInstance&&this._lastTarget instanceof window.SVGElementInstance&&(this._lastTarget=this._lastTarget.correspondingUseElement),H(this._lastTarget,`leaflet-drag-target`)),this._newPos=this._startPos.add(n),this._moving=!0,this._lastEvent=e,this._updatePosition())}},_updatePosition:function(){var e={originalEvent:this._lastEvent};this.fire(`predrag`,e),W(this._element,this._newPos),this.fire(`drag`,e)},_onUp:function(){this._enabled&&this.finishDrag()},finishDrag:function(e){U(document.body,`leaflet-dragging`),this._lastTarget&&=(U(this._lastTarget,`leaflet-drag-target`),null),q(document,`mousemove touchmove`,this._onMove,this),q(document,`mouseup touchend touchcancel`,this._onUp,this),Lt(),G();var t=this._moved&&this._moving;this._moving=!1,yn._dragging=!1,t&&this.fire(`dragend`,{noInertia:e,distance:this._newPos.distanceTo(this._startPos)})}});function bn(e,t,n){var r,i=[1,4,2,8],a,o,s,c,l,u,d,f;for(a=0,u=e.length;a<u;a++)e[a]._code=Mn(e[a],t);for(s=0;s<4;s++){for(d=i[s],r=[],a=0,u=e.length,o=u-1;a<u;o=a++)c=e[a],l=e[o],c._code&d?l._code&d||(f=jn(l,c,d,t,n),f._code=Mn(f,t),r.push(f)):(l._code&d&&(f=jn(l,c,d,t,n),f._code=Mn(f,t),r.push(f)),r.push(c));e=r}return e}function xn(e,t){var n,r,i,a,o,s,c,l,u;if(!e||e.length===0)throw Error(`latlngs not passed`);Fn(e)||(console.warn(`latlngs are not flat! Only the first ring will be used`),e=e[0]);var d=N([0,0]),f=j(e);f.getNorthWest().distanceTo(f.getSouthWest())*f.getNorthEast().distanceTo(f.getNorthWest())<1700&&(d=Q(e));var p=e.length,m=[];for(n=0;n<p;n++){var h=N(e[n]);m.push(t.project(N([h.lat-d.lat,h.lng-d.lng])))}for(s=c=l=0,n=0,r=p-1;n<p;r=n++)i=m[n],a=m[r],o=i.y*a.x-a.y*i.x,c+=(i.x+a.x)*o,l+=(i.y+a.y)*o,s+=o*3;u=s===0?m[0]:[c/s,l/s];var g=t.unproject(D(u));return N([g.lat+d.lat,g.lng+d.lng])}function Q(e){for(var t=0,n=0,r=0,i=0;i<e.length;i++){var a=N(e[i]);t+=a.lat,n+=a.lng,r++}return N([t/r,n/r])}var Sn={__proto__:null,clipPolygon:bn,polygonCenter:xn,centroid:Q};function Cn(e,t){if(!t||!e.length)return e.slice();var n=t*t;return e=On(e,n),e=En(e,n),e}function wn(e,t,n){return Math.sqrt(Pn(e,t,n,!0))}function Tn(e,t,n){return Pn(e,t,n)}function En(e,t){var n=e.length,r=new(typeof Uint8Array<`u`?Uint8Array:Array)(n);r[0]=r[n-1]=1,Dn(e,r,t,0,n-1);var i,a=[];for(i=0;i<n;i++)r[i]&&a.push(e[i]);return a}function Dn(e,t,n,r,i){var a=0,o,s,c;for(s=r+1;s<=i-1;s++)c=Pn(e[s],e[r],e[i],!0),c>a&&(o=s,a=c);a>n&&(t[o]=1,Dn(e,t,n,r,o),Dn(e,t,n,o,i))}function On(e,t){for(var n=[e[0]],r=1,i=0,a=e.length;r<a;r++)Nn(e[r],e[i])>t&&(n.push(e[r]),i=r);return i<a-1&&n.push(e[a-1]),n}var kn;function An(e,t,n,r,i){var a=r?kn:Mn(e,n),o=Mn(t,n),s,c,l;for(kn=o;;){if(!(a|o))return[e,t];if(a&o)return!1;s=a||o,c=jn(e,t,s,n,i),l=Mn(c,n),s===a?(e=c,a=l):(t=c,o=l)}}function jn(e,t,n,r,i){var a=t.x-e.x,o=t.y-e.y,s=r.min,c=r.max,l,u;return n&8?(l=e.x+a*(c.y-e.y)/o,u=c.y):n&4?(l=e.x+a*(s.y-e.y)/o,u=s.y):n&2?(l=c.x,u=e.y+o*(c.x-e.x)/a):n&1&&(l=s.x,u=e.y+o*(s.x-e.x)/a),new E(l,u,i)}function Mn(e,t){var n=0;return e.x<t.min.x?n|=1:e.x>t.max.x&&(n|=2),e.y<t.min.y?n|=4:e.y>t.max.y&&(n|=8),n}function Nn(e,t){var n=t.x-e.x,r=t.y-e.y;return n*n+r*r}function Pn(e,t,n,r){var i=t.x,a=t.y,o=n.x-i,s=n.y-a,c=o*o+s*s,l;return c>0&&(l=((e.x-i)*o+(e.y-a)*s)/c,l>1?(i=n.x,a=n.y):l>0&&(i+=o*l,a+=s*l)),o=e.x-i,s=e.y-a,r?o*o+s*s:new E(i,a)}function Fn(e){return!_(e[0])||typeof e[0][0]!=`object`&&e[0][0]!==void 0}function In(e){return console.warn(`Deprecated use of _flat, please use L.LineUtil.isFlat instead.`),Fn(e)}function Ln(e,t){var n,r,i,a,o,s,c,l;if(!e||e.length===0)throw Error(`latlngs not passed`);Fn(e)||(console.warn(`latlngs are not flat! Only the first ring will be used`),e=e[0]);var u=N([0,0]),d=j(e);d.getNorthWest().distanceTo(d.getSouthWest())*d.getNorthEast().distanceTo(d.getNorthWest())<1700&&(u=Q(e));var f=e.length,p=[];for(n=0;n<f;n++){var m=N(e[n]);p.push(t.project(N([m.lat-u.lat,m.lng-u.lng])))}for(n=0,r=0;n<f-1;n++)r+=p[n].distanceTo(p[n+1])/2;if(r===0)l=p[0];else for(n=0,a=0;n<f-1;n++)if(o=p[n],s=p[n+1],i=o.distanceTo(s),a+=i,a>r){c=(a-r)/i,l=[s.x-c*(s.x-o.x),s.y-c*(s.y-o.y)];break}var h=t.unproject(D(l));return N([h.lat+u.lat,h.lng+u.lng])}var Rn={__proto__:null,simplify:Cn,pointToSegmentDistance:wn,closestPointOnSegment:Tn,clipSegment:An,_getEdgeIntersection:jn,_getBitCode:Mn,_sqClosestPointOnSegment:Pn,isFlat:Fn,_flat:In,polylineCenter:Ln},zn={project:function(e){return new E(e.lng,e.lat)},unproject:function(e){return new M(e.y,e.x)},bounds:new O([-180,-90],[180,90])},Bn={R:6378137,R_MINOR:6356752.314245179,bounds:new O([-20037508.34279,-15496570.73972],[20037508.34279,18764656.23138]),project:function(e){var t=Math.PI/180,n=this.R,r=e.lat*t,i=this.R_MINOR/n,a=Math.sqrt(1-i*i),o=a*Math.sin(r),s=Math.tan(Math.PI/4-r/2)/((1-o)/(1+o))**(a/2);return r=-n*Math.log(Math.max(s,1e-10)),new E(e.lng*t*n,r)},unproject:function(e){for(var t=180/Math.PI,n=this.R,r=this.R_MINOR/n,i=Math.sqrt(1-r*r),a=Math.exp(-e.y/n),o=Math.PI/2-2*Math.atan(a),s=0,c=.1,l;s<15&&Math.abs(c)>1e-7;s++)l=i*Math.sin(o),l=((1-l)/(1+l))**(i/2),c=Math.PI/2-2*Math.atan(a*l)-o,o+=c;return new M(o*t,e.x*t/n)}},Vn={__proto__:null,LonLat:zn,Mercator:Bn,SphericalMercator:le},Hn=n({},P,{code:`EPSG:3395`,projection:Bn,transformation:function(){var e=.5/(Math.PI*Bn.R);return de(e,.5,-e,.5)}()}),Un=n({},P,{code:`EPSG:4326`,projection:zn,transformation:de(1/180,1,-1/180,.5)}),Wn=n({},se,{projection:zn,transformation:de(1,0,-1,0),scale:function(e){return 2**e},zoom:function(e){return Math.log(e)/Math.LN2},distance:function(e,t){var n=t.lng-e.lng,r=t.lat-e.lat;return Math.sqrt(n*n+r*r)},infinite:!0});se.Earth=P,se.EPSG3395=Hn,se.EPSG3857=fe,se.EPSG900913=pe,se.EPSG4326=Un,se.Simple=Wn;var Gn=T.extend({options:{pane:`overlayPane`,attribution:null,bubblingMouseEvents:!0},addTo:function(e){return e.addLayer(this),this},remove:function(){return this.removeFrom(this._map||this._mapToAdd)},removeFrom:function(e){return e&&e.removeLayer(this),this},getPane:function(e){return this._map.getPane(e?this.options[e]||e:this.options.pane)},addInteractiveTarget:function(e){return this._map._targets[o(e)]=this,this},removeInteractiveTarget:function(e){return delete this._map._targets[o(e)],this},getAttribution:function(){return this.options.attribution},_layerAdd:function(e){var t=e.target;if(t.hasLayer(this)){if(this._map=t,this._zoomAnimated=t._zoomAnimated,this.getEvents){var n=this.getEvents();t.on(n,this),this.once(`remove`,function(){t.off(n,this)},this)}this.onAdd(t),this.fire(`add`),t.fire(`layeradd`,{layer:this})}}});Y.include({addLayer:function(e){if(!e._layerAdd)throw Error(`The provided object is not a Layer.`);var t=o(e);return this._layers[t]?this:(this._layers[t]=e,e._mapToAdd=this,e.beforeAdd&&e.beforeAdd(this),this.whenReady(e._layerAdd,e),this)},removeLayer:function(e){var t=o(e);return this._layers[t]?(this._loaded&&e.onRemove(this),delete this._layers[t],this._loaded&&(this.fire(`layerremove`,{layer:e}),e.fire(`remove`)),e._map=e._mapToAdd=null,this):this},hasLayer:function(e){return o(e)in this._layers},eachLayer:function(e,t){for(var n in this._layers)e.call(t,this._layers[n]);return this},_addLayers:function(e){e=e?_(e)?e:[e]:[];for(var t=0,n=e.length;t<n;t++)this.addLayer(e[t])},_addZoomLimit:function(e){(!isNaN(e.options.maxZoom)||!isNaN(e.options.minZoom))&&(this._zoomBoundLayers[o(e)]=e,this._updateZoomLevels())},_removeZoomLimit:function(e){var t=o(e);this._zoomBoundLayers[t]&&(delete this._zoomBoundLayers[t],this._updateZoomLevels())},_updateZoomLevels:function(){var e=1/0,t=-1/0,n=this._getZoomSpan();for(var r in this._zoomBoundLayers){var i=this._zoomBoundLayers[r].options;e=i.minZoom===void 0?e:Math.min(e,i.minZoom),t=i.maxZoom===void 0?t:Math.max(t,i.maxZoom)}this._layersMaxZoom=t===-1/0?void 0:t,this._layersMinZoom=e===1/0?void 0:e,n!==this._getZoomSpan()&&this.fire(`zoomlevelschange`),this.options.maxZoom===void 0&&this._layersMaxZoom&&this.getZoom()>this._layersMaxZoom&&this.setZoom(this._layersMaxZoom),this.options.minZoom===void 0&&this._layersMinZoom&&this.getZoom()<this._layersMinZoom&&this.setZoom(this._layersMinZoom)}});var Kn=Gn.extend({initialize:function(e,t){p(this,t),this._layers={};var n,r;if(e)for(n=0,r=e.length;n<r;n++)this.addLayer(e[n])},addLayer:function(e){var t=this.getLayerId(e);return this._layers[t]=e,this._map&&this._map.addLayer(e),this},removeLayer:function(e){var t=e in this._layers?e:this.getLayerId(e);return this._map&&this._layers[t]&&this._map.removeLayer(this._layers[t]),delete this._layers[t],this},hasLayer:function(e){return(typeof e==`number`?e:this.getLayerId(e))in this._layers},clearLayers:function(){return this.eachLayer(this.removeLayer,this)},invoke:function(e){var t=Array.prototype.slice.call(arguments,1),n,r;for(n in this._layers)r=this._layers[n],r[e]&&r[e].apply(r,t);return this},onAdd:function(e){this.eachLayer(e.addLayer,e)},onRemove:function(e){this.eachLayer(e.removeLayer,e)},eachLayer:function(e,t){for(var n in this._layers)e.call(t,this._layers[n]);return this},getLayer:function(e){return this._layers[e]},getLayers:function(){var e=[];return this.eachLayer(e.push,e),e},setZIndex:function(e){return this.invoke(`setZIndex`,e)},getLayerId:function(e){return o(e)}}),qn=function(e,t){return new Kn(e,t)},Jn=Kn.extend({addLayer:function(e){return this.hasLayer(e)?this:(e.addEventParent(this),Kn.prototype.addLayer.call(this,e),this.fire(`layeradd`,{layer:e}))},removeLayer:function(e){return this.hasLayer(e)?(e in this._layers&&(e=this._layers[e]),e.removeEventParent(this),Kn.prototype.removeLayer.call(this,e),this.fire(`layerremove`,{layer:e})):this},setStyle:function(e){return this.invoke(`setStyle`,e)},bringToFront:function(){return this.invoke(`bringToFront`)},bringToBack:function(){return this.invoke(`bringToBack`)},getBounds:function(){var e=new A;for(var t in this._layers){var n=this._layers[t];e.extend(n.getBounds?n.getBounds():n.getLatLng())}return e}}),Yn=function(e,t){return new Jn(e,t)},Xn=C.extend({options:{popupAnchor:[0,0],tooltipAnchor:[0,0],crossOrigin:!1},initialize:function(e){p(this,e)},createIcon:function(e){return this._createIcon(`icon`,e)},createShadow:function(e){return this._createIcon(`shadow`,e)},_createIcon:function(e,t){var n=this._getIconUrl(e);if(!n){if(e===`icon`)throw Error(`iconUrl not set in Icon options (see the docs).`);return null}var r=this._createImg(n,t&&t.tagName===`IMG`?t:null);return this._setIconStyles(r,e),(this.options.crossOrigin||this.options.crossOrigin===``)&&(r.crossOrigin=this.options.crossOrigin===!0?``:this.options.crossOrigin),r},_setIconStyles:function(e,t){var n=this.options,r=n[t+`Size`];typeof r==`number`&&(r=[r,r]);var i=D(r),a=D(t===`shadow`&&n.shadowAnchor||n.iconAnchor||i&&i.divideBy(2,!0));e.className=`leaflet-marker-`+t+` `+(n.className||``),a&&(e.style.marginLeft=-a.x+`px`,e.style.marginTop=-a.y+`px`),i&&(e.style.width=i.x+`px`,e.style.height=i.y+`px`)},_createImg:function(e,t){return t||=document.createElement(`img`),t.src=e,t},_getIconUrl:function(e){return z.retina&&this.options[e+`RetinaUrl`]||this.options[e+`Url`]}});function Zn(e){return new Xn(e)}var Qn=Xn.extend({options:{iconUrl:`marker-icon.png`,iconRetinaUrl:`marker-icon-2x.png`,shadowUrl:`marker-shadow.png`,iconSize:[25,41],iconAnchor:[12,41],popupAnchor:[1,-34],tooltipAnchor:[16,-28],shadowSize:[41,41]},_getIconUrl:function(e){return typeof Qn.imagePath!=`string`&&(Qn.imagePath=this._detectIconPath()),(this.options.imagePath||Qn.imagePath)+Xn.prototype._getIconUrl.call(this,e)},_stripUrl:function(e){var t=function(e,t,n){var r=t.exec(e);return r&&r[n]};return e=t(e,/^url\((['"])?(.+)\1\)$/,2),e&&t(e,/^(.*)marker-icon\.png$/,1)},_detectIconPath:function(){var e=B(`div`,`leaflet-default-icon-path`,document.body),t=xt(e,`background-image`)||xt(e,`backgroundImage`);if(document.body.removeChild(e),t=this._stripUrl(t),t)return t;var n=document.querySelector(`link[href$="leaflet.css"]`);return n?n.href.substring(0,n.href.length-11-1):``}}),$n=Z.extend({initialize:function(e){this._marker=e},addHooks:function(){var e=this._marker._icon;this._draggable||=new yn(e,e,!0),this._draggable.on({dragstart:this._onDragStart,predrag:this._onPreDrag,drag:this._onDrag,dragend:this._onDragEnd},this).enable(),H(e,`leaflet-marker-draggable`)},removeHooks:function(){this._draggable.off({dragstart:this._onDragStart,predrag:this._onPreDrag,drag:this._onDrag,dragend:this._onDragEnd},this).disable(),this._marker._icon&&U(this._marker._icon,`leaflet-marker-draggable`)},moved:function(){return this._draggable&&this._draggable._moved},_adjustPan:function(e){var t=this._marker,n=t._map,r=this._marker.options.autoPanSpeed,i=this._marker.options.autoPanPadding,a=Mt(t._icon),o=n.getPixelBounds(),s=n.getPixelOrigin(),c=k(o.min._subtract(s).add(i),o.max._subtract(s).subtract(i));if(!c.contains(a)){var l=D((Math.max(c.max.x,a.x)-c.max.x)/(o.max.x-c.max.x)-(Math.min(c.min.x,a.x)-c.min.x)/(o.min.x-c.min.x),(Math.max(c.max.y,a.y)-c.max.y)/(o.max.y-c.max.y)-(Math.min(c.min.y,a.y)-c.min.y)/(o.min.y-c.min.y)).multiplyBy(r);n.panBy(l,{animate:!1}),this._draggable._newPos._add(l),this._draggable._startPos._add(l),W(t._icon,this._draggable._newPos),this._onDrag(e),this._panRequest=x(this._adjustPan.bind(this,e))}},_onDragStart:function(){this._oldLatLng=this._marker.getLatLng(),this._marker.closePopup&&this._marker.closePopup(),this._marker.fire(`movestart`).fire(`dragstart`)},_onPreDrag:function(e){this._marker.options.autoPan&&(S(this._panRequest),this._panRequest=x(this._adjustPan.bind(this,e)))},_onDrag:function(e){var t=this._marker,n=t._shadow,r=Mt(t._icon),i=t._map.layerPointToLatLng(r);n&&W(n,r),t._latlng=i,e.latlng=i,e.oldLatLng=this._oldLatLng,t.fire(`move`,e).fire(`drag`,e)},_onDragEnd:function(e){S(this._panRequest),delete this._oldLatLng,this._marker.fire(`moveend`).fire(`dragend`,e)}}),er=Gn.extend({options:{icon:new Qn,interactive:!0,keyboard:!0,title:``,alt:`Marker`,zIndexOffset:0,opacity:1,riseOnHover:!1,riseOffset:250,pane:`markerPane`,shadowPane:`shadowPane`,bubblingMouseEvents:!1,autoPanOnFocus:!0,draggable:!1,autoPan:!1,autoPanPadding:[50,50],autoPanSpeed:10},initialize:function(e,t){p(this,t),this._latlng=N(e)},onAdd:function(e){this._zoomAnimated=this._zoomAnimated&&e.options.markerZoomAnimation,this._zoomAnimated&&e.on(`zoomanim`,this._animateZoom,this),this._initIcon(),this.update()},onRemove:function(e){this.dragging&&this.dragging.enabled()&&(this.options.draggable=!0,this.dragging.removeHooks()),delete this.dragging,this._zoomAnimated&&e.off(`zoomanim`,this._animateZoom,this),this._removeIcon(),this._removeShadow()},getEvents:function(){return{zoom:this.update,viewreset:this.update}},getLatLng:function(){return this._latlng},setLatLng:function(e){var t=this._latlng;return this._latlng=N(e),this.update(),this.fire(`move`,{oldLatLng:t,latlng:this._latlng})},setZIndexOffset:function(e){return this.options.zIndexOffset=e,this.update()},getIcon:function(){return this.options.icon},setIcon:function(e){return this.options.icon=e,this._map&&(this._initIcon(),this.update()),this._popup&&this.bindPopup(this._popup,this._popup.options),this},getElement:function(){return this._icon},update:function(){if(this._icon&&this._map){var e=this._map.latLngToLayerPoint(this._latlng).round();this._setPos(e)}return this},_initIcon:function(){var e=this.options,t=`leaflet-zoom-`+(this._zoomAnimated?`animated`:`hide`),n=e.icon.createIcon(this._icon),r=!1;n!==this._icon&&(this._icon&&this._removeIcon(),r=!0,e.title&&(n.title=e.title),n.tagName===`IMG`&&(n.alt=e.alt||``)),H(n,t),e.keyboard&&(n.tabIndex=`0`,n.setAttribute(`role`,`button`)),this._icon=n,e.riseOnHover&&this.on({mouseover:this._bringToFront,mouseout:this._resetZIndex}),this.options.autoPanOnFocus&&K(n,`focus`,this._panOnFocus,this);var i=e.icon.createShadow(this._shadow),a=!1;i!==this._shadow&&(this._removeShadow(),a=!0),i&&(H(i,t),i.alt=``),this._shadow=i,e.opacity<1&&this._updateOpacity(),r&&this.getPane().appendChild(this._icon),this._initInteraction(),i&&a&&this.getPane(e.shadowPane).appendChild(this._shadow)},_removeIcon:function(){this.options.riseOnHover&&this.off({mouseover:this._bringToFront,mouseout:this._resetZIndex}),this.options.autoPanOnFocus&&q(this._icon,`focus`,this._panOnFocus,this),V(this._icon),this.removeInteractiveTarget(this._icon),this._icon=null},_removeShadow:function(){this._shadow&&V(this._shadow),this._shadow=null},_setPos:function(e){this._icon&&W(this._icon,e),this._shadow&&W(this._shadow,e),this._zIndex=e.y+this.options.zIndexOffset,this._resetZIndex()},_updateZIndex:function(e){this._icon&&(this._icon.style.zIndex=this._zIndex+e)},_animateZoom:function(e){var t=this._map._latLngToNewLayerPoint(this._latlng,e.zoom,e.center).round();this._setPos(t)},_initInteraction:function(){if(this.options.interactive&&(H(this._icon,`leaflet-interactive`),this.addInteractiveTarget(this._icon),$n)){var e=this.options.draggable;this.dragging&&(e=this.dragging.enabled(),this.dragging.disable()),this.dragging=new $n(this),e&&this.dragging.enable()}},setOpacity:function(e){return this.options.opacity=e,this._map&&this._updateOpacity(),this},_updateOpacity:function(){var e=this.options.opacity;this._icon&&Ot(this._icon,e),this._shadow&&Ot(this._shadow,e)},_bringToFront:function(){this._updateZIndex(this.options.riseOffset)},_resetZIndex:function(){this._updateZIndex(0)},_panOnFocus:function(){var e=this._map;if(e){var t=this.options.icon.options,n=t.iconSize?D(t.iconSize):D(0,0),r=t.iconAnchor?D(t.iconAnchor):D(0,0);e.panInside(this._latlng,{paddingTopLeft:r,paddingBottomRight:n.subtract(r)})}},_getPopupAnchor:function(){return this.options.icon.options.popupAnchor},_getTooltipAnchor:function(){return this.options.icon.options.tooltipAnchor}});function tr(e,t){return new er(e,t)}var nr=Gn.extend({options:{stroke:!0,color:`#3388ff`,weight:3,opacity:1,lineCap:`round`,lineJoin:`round`,dashArray:null,dashOffset:null,fill:!1,fillColor:null,fillOpacity:.2,fillRule:`evenodd`,interactive:!0,bubblingMouseEvents:!0},beforeAdd:function(e){this._renderer=e.getRenderer(this)},onAdd:function(){this._renderer._initPath(this),this._reset(),this._renderer._addPath(this)},onRemove:function(){this._renderer._removePath(this)},redraw:function(){return this._map&&this._renderer._updatePath(this),this},setStyle:function(e){return p(this,e),this._renderer&&(this._renderer._updateStyle(this),this.options.stroke&&e&&Object.prototype.hasOwnProperty.call(e,`weight`)&&this._updateBounds()),this},bringToFront:function(){return this._renderer&&this._renderer._bringToFront(this),this},bringToBack:function(){return this._renderer&&this._renderer._bringToBack(this),this},getElement:function(){return this._path},_reset:function(){this._project(),this._update()},_clickTolerance:function(){return(this.options.stroke?this.options.weight/2:0)+(this._renderer.options.tolerance||0)}}),rr=nr.extend({options:{fill:!0,radius:10},initialize:function(e,t){p(this,t),this._latlng=N(e),this._radius=this.options.radius},setLatLng:function(e){var t=this._latlng;return this._latlng=N(e),this.redraw(),this.fire(`move`,{oldLatLng:t,latlng:this._latlng})},getLatLng:function(){return this._latlng},setRadius:function(e){return this.options.radius=this._radius=e,this.redraw()},getRadius:function(){return this._radius},setStyle:function(e){var t=e&&e.radius||this._radius;return nr.prototype.setStyle.call(this,e),this.setRadius(t),this},_project:function(){this._point=this._map.latLngToLayerPoint(this._latlng),this._updateBounds()},_updateBounds:function(){var e=this._radius,t=this._radiusY||e,n=this._clickTolerance(),r=[e+n,t+n];this._pxBounds=new O(this._point.subtract(r),this._point.add(r))},_update:function(){this._map&&this._updatePath()},_updatePath:function(){this._renderer._updateCircle(this)},_empty:function(){return this._radius&&!this._renderer._bounds.intersects(this._pxBounds)},_containsPoint:function(e){return e.distanceTo(this._point)<=this._radius+this._clickTolerance()}});function ir(e,t){return new rr(e,t)}var ar=rr.extend({initialize:function(e,t,r){if(typeof t==`number`&&(t=n({},r,{radius:t})),p(this,t),this._latlng=N(e),isNaN(this.options.radius))throw Error(`Circle radius cannot be NaN`);this._mRadius=this.options.radius},setRadius:function(e){return this._mRadius=e,this.redraw()},getRadius:function(){return this._mRadius},getBounds:function(){var e=[this._radius,this._radiusY||this._radius];return new A(this._map.layerPointToLatLng(this._point.subtract(e)),this._map.layerPointToLatLng(this._point.add(e)))},setStyle:nr.prototype.setStyle,_project:function(){var e=this._latlng.lng,t=this._latlng.lat,n=this._map,r=n.options.crs;if(r.distance===P.distance){var i=Math.PI/180,a=this._mRadius/P.R/i,o=n.project([t+a,e]),s=n.project([t-a,e]),c=o.add(s).divideBy(2),l=n.unproject(c).lat,u=Math.acos((Math.cos(a*i)-Math.sin(t*i)*Math.sin(l*i))/(Math.cos(t*i)*Math.cos(l*i)))/i;(isNaN(u)||u===0)&&(u=a/Math.cos(Math.PI/180*t)),this._point=c.subtract(n.getPixelOrigin()),this._radius=isNaN(u)?0:c.x-n.project([l,e-u]).x,this._radiusY=c.y-o.y}else{var d=r.unproject(r.project(this._latlng).subtract([this._mRadius,0]));this._point=n.latLngToLayerPoint(this._latlng),this._radius=this._point.x-n.latLngToLayerPoint(d).x}this._updateBounds()}});function or(e,t,n){return new ar(e,t,n)}var sr=nr.extend({options:{smoothFactor:1,noClip:!1},initialize:function(e,t){p(this,t),this._setLatLngs(e)},getLatLngs:function(){return this._latlngs},setLatLngs:function(e){return this._setLatLngs(e),this.redraw()},isEmpty:function(){return!this._latlngs.length},closestLayerPoint:function(e){for(var t=1/0,n=null,r=Pn,i,a,o=0,s=this._parts.length;o<s;o++)for(var c=this._parts[o],l=1,u=c.length;l<u;l++){i=c[l-1],a=c[l];var d=r(e,i,a,!0);d<t&&(t=d,n=r(e,i,a))}return n&&(n.distance=Math.sqrt(t)),n},getCenter:function(){if(!this._map)throw Error(`Must add layer to map before using getCenter()`);return Ln(this._defaultShape(),this._map.options.crs)},getBounds:function(){return this._bounds},addLatLng:function(e,t){return t||=this._defaultShape(),e=N(e),t.push(e),this._bounds.extend(e),this.redraw()},_setLatLngs:function(e){this._bounds=new A,this._latlngs=this._convertLatLngs(e)},_defaultShape:function(){return Fn(this._latlngs)?this._latlngs:this._latlngs[0]},_convertLatLngs:function(e){for(var t=[],n=Fn(e),r=0,i=e.length;r<i;r++)n?(t[r]=N(e[r]),this._bounds.extend(t[r])):t[r]=this._convertLatLngs(e[r]);return t},_project:function(){var e=new O;this._rings=[],this._projectLatlngs(this._latlngs,this._rings,e),this._bounds.isValid()&&e.isValid()&&(this._rawPxBounds=e,this._updateBounds())},_updateBounds:function(){var e=this._clickTolerance(),t=new E(e,e);this._rawPxBounds&&(this._pxBounds=new O([this._rawPxBounds.min.subtract(t),this._rawPxBounds.max.add(t)]))},_projectLatlngs:function(e,t,n){var r=e[0]instanceof M,i=e.length,a,o;if(r){for(o=[],a=0;a<i;a++)o[a]=this._map.latLngToLayerPoint(e[a]),n.extend(o[a]);t.push(o)}else for(a=0;a<i;a++)this._projectLatlngs(e[a],t,n)},_clipPoints:function(){var e=this._renderer._bounds;if(this._parts=[],!(!this._pxBounds||!this._pxBounds.intersects(e))){if(this.options.noClip){this._parts=this._rings;return}var t=this._parts,n,r,i,a,o,s,c;for(n=0,i=0,a=this._rings.length;n<a;n++)for(c=this._rings[n],r=0,o=c.length;r<o-1;r++)s=An(c[r],c[r+1],e,r,!0),s&&(t[i]=t[i]||[],t[i].push(s[0]),(s[1]!==c[r+1]||r===o-2)&&(t[i].push(s[1]),i++))}},_simplifyPoints:function(){for(var e=this._parts,t=this.options.smoothFactor,n=0,r=e.length;n<r;n++)e[n]=Cn(e[n],t)},_update:function(){this._map&&(this._clipPoints(),this._simplifyPoints(),this._updatePath())},_updatePath:function(){this._renderer._updatePoly(this)},_containsPoint:function(e,t){var n,r,i,a,o,s,c=this._clickTolerance();if(!this._pxBounds||!this._pxBounds.contains(e))return!1;for(n=0,a=this._parts.length;n<a;n++)for(s=this._parts[n],r=0,o=s.length,i=o-1;r<o;i=r++)if(!(!t&&r===0)&&wn(e,s[i],s[r])<=c)return!0;return!1}});function cr(e,t){return new sr(e,t)}sr._flat=In;var lr=sr.extend({options:{fill:!0},isEmpty:function(){return!this._latlngs.length||!this._latlngs[0].length},getCenter:function(){if(!this._map)throw Error(`Must add layer to map before using getCenter()`);return xn(this._defaultShape(),this._map.options.crs)},_convertLatLngs:function(e){var t=sr.prototype._convertLatLngs.call(this,e),n=t.length;return n>=2&&t[0]instanceof M&&t[0].equals(t[n-1])&&t.pop(),t},_setLatLngs:function(e){sr.prototype._setLatLngs.call(this,e),Fn(this._latlngs)&&(this._latlngs=[this._latlngs])},_defaultShape:function(){return Fn(this._latlngs[0])?this._latlngs[0]:this._latlngs[0][0]},_clipPoints:function(){var e=this._renderer._bounds,t=this.options.weight,n=new E(t,t);if(e=new O(e.min.subtract(n),e.max.add(n)),this._parts=[],!(!this._pxBounds||!this._pxBounds.intersects(e))){if(this.options.noClip){this._parts=this._rings;return}for(var r=0,i=this._rings.length,a;r<i;r++)a=bn(this._rings[r],e,!0),a.length&&this._parts.push(a)}},_updatePath:function(){this._renderer._updatePoly(this,!0)},_containsPoint:function(e){var t=!1,n,r,i,a,o,s,c,l;if(!this._pxBounds||!this._pxBounds.contains(e))return!1;for(a=0,c=this._parts.length;a<c;a++)for(n=this._parts[a],o=0,l=n.length,s=l-1;o<l;s=o++)r=n[o],i=n[s],r.y>e.y!=i.y>e.y&&e.x<(i.x-r.x)*(e.y-r.y)/(i.y-r.y)+r.x&&(t=!t);return t||sr.prototype._containsPoint.call(this,e,!0)}});function ur(e,t){return new lr(e,t)}var dr=Jn.extend({initialize:function(e,t){p(this,t),this._layers={},e&&this.addData(e)},addData:function(e){var t=_(e)?e:e.features,n,r,i;if(t){for(n=0,r=t.length;n<r;n++)i=t[n],(i.geometries||i.geometry||i.features||i.coordinates)&&this.addData(i);return this}var a=this.options;if(a.filter&&!a.filter(e))return this;var o=fr(e,a);return o?(o.feature=yr(e),o.defaultOptions=o.options,this.resetStyle(o),a.onEachFeature&&a.onEachFeature(e,o),this.addLayer(o)):this},resetStyle:function(e){return e===void 0?this.eachLayer(this.resetStyle,this):(e.options=n({},e.defaultOptions),this._setLayerStyle(e,this.options.style),this)},setStyle:function(e){return this.eachLayer(function(t){this._setLayerStyle(t,e)},this)},_setLayerStyle:function(e,t){e.setStyle&&(typeof t==`function`&&(t=t(e.feature)),e.setStyle(t))}});function fr(e,t){var n=e.type===`Feature`?e.geometry:e,r=n?n.coordinates:null,i=[],a=t&&t.pointToLayer,o=t&&t.coordsToLatLng||mr,s,c,l,u;if(!r&&!n)return null;switch(n.type){case`Point`:return s=o(r),pr(a,e,s,t);case`MultiPoint`:for(l=0,u=r.length;l<u;l++)s=o(r[l]),i.push(pr(a,e,s,t));return new Jn(i);case`LineString`:case`MultiLineString`:return c=hr(r,n.type===`LineString`?0:1,o),new sr(c,t);case`Polygon`:case`MultiPolygon`:return c=hr(r,n.type===`Polygon`?1:2,o),new lr(c,t);case`GeometryCollection`:for(l=0,u=n.geometries.length;l<u;l++){var d=fr({geometry:n.geometries[l],type:`Feature`,properties:e.properties},t);d&&i.push(d)}return new Jn(i);case`FeatureCollection`:for(l=0,u=n.features.length;l<u;l++){var f=fr(n.features[l],t);f&&i.push(f)}return new Jn(i);default:throw Error(`Invalid GeoJSON object.`)}}function pr(e,t,n,r){return e?e(t,n):new er(n,r&&r.markersInheritOptions&&r)}function mr(e){return new M(e[1],e[0],e[2])}function hr(e,t,n){for(var r=[],i=0,a=e.length,o;i<a;i++)o=t?hr(e[i],t-1,n):(n||mr)(e[i]),r.push(o);return r}function gr(e,t){return e=N(e),e.alt===void 0?[u(e.lng,t),u(e.lat,t)]:[u(e.lng,t),u(e.lat,t),u(e.alt,t)]}function _r(e,t,n,r){for(var i=[],a=0,o=e.length;a<o;a++)i.push(t?_r(e[a],Fn(e[a])?0:t-1,n,r):gr(e[a],r));return!t&&n&&i.length>0&&i.push(i[0].slice()),i}function vr(e,t){return e.feature?n({},e.feature,{geometry:t}):yr(t)}function yr(e){return e.type===`Feature`||e.type===`FeatureCollection`?e:{type:`Feature`,properties:{},geometry:e}}var br={toGeoJSON:function(e){return vr(this,{type:`Point`,coordinates:gr(this.getLatLng(),e)})}};er.include(br),ar.include(br),rr.include(br),sr.include({toGeoJSON:function(e){var t=!Fn(this._latlngs),n=_r(this._latlngs,+!!t,!1,e);return vr(this,{type:(t?`Multi`:``)+`LineString`,coordinates:n})}}),lr.include({toGeoJSON:function(e){var t=!Fn(this._latlngs),n=t&&!Fn(this._latlngs[0]),r=_r(this._latlngs,n?2:+!!t,!0,e);return t||(r=[r]),vr(this,{type:(n?`Multi`:``)+`Polygon`,coordinates:r})}}),Kn.include({toMultiPoint:function(e){var t=[];return this.eachLayer(function(n){t.push(n.toGeoJSON(e).geometry.coordinates)}),vr(this,{type:`MultiPoint`,coordinates:t})},toGeoJSON:function(e){var t=this.feature&&this.feature.geometry&&this.feature.geometry.type;if(t===`MultiPoint`)return this.toMultiPoint(e);var n=t===`GeometryCollection`,r=[];return this.eachLayer(function(t){if(t.toGeoJSON){var i=t.toGeoJSON(e);if(n)r.push(i.geometry);else{var a=yr(i);a.type===`FeatureCollection`?r.push.apply(r,a.features):r.push(a)}}}),n?vr(this,{geometries:r,type:`GeometryCollection`}):{type:`FeatureCollection`,features:r}}});function xr(e,t){return new dr(e,t)}var Sr=xr,Cr=Gn.extend({options:{opacity:1,alt:``,interactive:!1,crossOrigin:!1,errorOverlayUrl:``,zIndex:1,className:``},initialize:function(e,t,n){this._url=e,this._bounds=j(t),p(this,n)},onAdd:function(){this._image||(this._initImage(),this.options.opacity<1&&this._updateOpacity()),this.options.interactive&&(H(this._image,`leaflet-interactive`),this.addInteractiveTarget(this._image)),this.getPane().appendChild(this._image),this._reset()},onRemove:function(){V(this._image),this.options.interactive&&this.removeInteractiveTarget(this._image)},setOpacity:function(e){return this.options.opacity=e,this._image&&this._updateOpacity(),this},setStyle:function(e){return e.opacity&&this.setOpacity(e.opacity),this},bringToFront:function(){return this._map&&Ct(this._image),this},bringToBack:function(){return this._map&&wt(this._image),this},setUrl:function(e){return this._url=e,this._image&&(this._image.src=e),this},setBounds:function(e){return this._bounds=j(e),this._map&&this._reset(),this},getEvents:function(){var e={zoom:this._reset,viewreset:this._reset};return this._zoomAnimated&&(e.zoomanim=this._animateZoom),e},setZIndex:function(e){return this.options.zIndex=e,this._updateZIndex(),this},getBounds:function(){return this._bounds},getElement:function(){return this._image},_initImage:function(){var e=this._url.tagName===`IMG`,t=this._image=e?this._url:B(`img`);if(H(t,`leaflet-image-layer`),this._zoomAnimated&&H(t,`leaflet-zoom-animated`),this.options.className&&H(t,this.options.className),t.onselectstart=l,t.onmousemove=l,t.onload=i(this.fire,this,`load`),t.onerror=i(this._overlayOnError,this,`error`),(this.options.crossOrigin||this.options.crossOrigin===``)&&(t.crossOrigin=this.options.crossOrigin===!0?``:this.options.crossOrigin),this.options.zIndex&&this._updateZIndex(),e){this._url=t.src;return}t.src=this._url,t.alt=this.options.alt},_animateZoom:function(e){var t=this._map.getZoomScale(e.zoom),n=this._map._latLngBoundsToNewLayerBounds(this._bounds,e.zoom,e.center).min;jt(this._image,n,t)},_reset:function(){var e=this._image,t=new O(this._map.latLngToLayerPoint(this._bounds.getNorthWest()),this._map.latLngToLayerPoint(this._bounds.getSouthEast())),n=t.getSize();W(e,t.min),e.style.width=n.x+`px`,e.style.height=n.y+`px`},_updateOpacity:function(){Ot(this._image,this.options.opacity)},_updateZIndex:function(){this._image&&this.options.zIndex!==void 0&&this.options.zIndex!==null&&(this._image.style.zIndex=this.options.zIndex)},_overlayOnError:function(){this.fire(`error`);var e=this.options.errorOverlayUrl;e&&this._url!==e&&(this._url=e,this._image.src=e)},getCenter:function(){return this._bounds.getCenter()}}),wr=function(e,t,n){return new Cr(e,t,n)},Tr=Cr.extend({options:{autoplay:!0,loop:!0,keepAspectRatio:!0,muted:!1,playsInline:!0},_initImage:function(){var e=this._url.tagName===`VIDEO`,t=this._image=e?this._url:B(`video`);if(H(t,`leaflet-image-layer`),this._zoomAnimated&&H(t,`leaflet-zoom-animated`),this.options.className&&H(t,this.options.className),t.onselectstart=l,t.onmousemove=l,t.onloadeddata=i(this.fire,this,`load`),e){for(var n=t.getElementsByTagName(`source`),r=[],a=0;a<n.length;a++)r.push(n[a].src);this._url=n.length>0?r:[t.src];return}_(this._url)||(this._url=[this._url]),!this.options.keepAspectRatio&&Object.prototype.hasOwnProperty.call(t.style,`objectFit`)&&(t.style.objectFit=`fill`),t.autoplay=!!this.options.autoplay,t.loop=!!this.options.loop,t.muted=!!this.options.muted,t.playsInline=!!this.options.playsInline;for(var o=0;o<this._url.length;o++){var s=B(`source`);s.src=this._url[o],t.appendChild(s)}}});function Er(e,t,n){return new Tr(e,t,n)}var Dr=Cr.extend({_initImage:function(){var e=this._image=this._url;H(e,`leaflet-image-layer`),this._zoomAnimated&&H(e,`leaflet-zoom-animated`),this.options.className&&H(e,this.options.className),e.onselectstart=l,e.onmousemove=l}});function Or(e,t,n){return new Dr(e,t,n)}var kr=Gn.extend({options:{interactive:!1,offset:[0,0],className:``,pane:void 0,content:``},initialize:function(e,t){e&&(e instanceof M||_(e))?(this._latlng=N(e),p(this,t)):(p(this,e),this._source=t),this.options.content&&(this._content=this.options.content)},openOn:function(e){return e=arguments.length?e:this._source._map,e.hasLayer(this)||e.addLayer(this),this},close:function(){return this._map&&this._map.removeLayer(this),this},toggle:function(e){return this._map?this.close():(arguments.length?this._source=e:e=this._source,this._prepareOpen(),this.openOn(e._map)),this},onAdd:function(e){this._zoomAnimated=e._zoomAnimated,this._container||this._initLayout(),e._fadeAnimated&&Ot(this._container,0),clearTimeout(this._removeTimeout),this.getPane().appendChild(this._container),this.update(),e._fadeAnimated&&Ot(this._container,1),this.bringToFront(),this.options.interactive&&(H(this._container,`leaflet-interactive`),this.addInteractiveTarget(this._container))},onRemove:function(e){e._fadeAnimated?(Ot(this._container,0),this._removeTimeout=setTimeout(i(V,void 0,this._container),200)):V(this._container),this.options.interactive&&(U(this._container,`leaflet-interactive`),this.removeInteractiveTarget(this._container))},getLatLng:function(){return this._latlng},setLatLng:function(e){return this._latlng=N(e),this._map&&(this._updatePosition(),this._adjustPan()),this},getContent:function(){return this._content},setContent:function(e){return this._content=e,this.update(),this},getElement:function(){return this._container},update:function(){this._map&&(this._container.style.visibility=`hidden`,this._updateContent(),this._updateLayout(),this._updatePosition(),this._container.style.visibility=``,this._adjustPan())},getEvents:function(){var e={zoom:this._updatePosition,viewreset:this._updatePosition};return this._zoomAnimated&&(e.zoomanim=this._animateZoom),e},isOpen:function(){return!!this._map&&this._map.hasLayer(this)},bringToFront:function(){return this._map&&Ct(this._container),this},bringToBack:function(){return this._map&&wt(this._container),this},_prepareOpen:function(e){var t=this._source;if(!t._map)return!1;if(t instanceof Jn){t=null;var n=this._source._layers;for(var r in n)if(n[r]._map){t=n[r];break}if(!t)return!1;this._source=t}if(!e)if(t.getCenter)e=t.getCenter();else if(t.getLatLng)e=t.getLatLng();else if(t.getBounds)e=t.getBounds().getCenter();else throw Error(`Unable to get source layer LatLng.`);return this.setLatLng(e),this._map&&this.update(),!0},_updateContent:function(){if(this._content){var e=this._contentNode,t=typeof this._content==`function`?this._content(this._source||this):this._content;if(typeof t==`string`)e.innerHTML=t;else{for(;e.hasChildNodes();)e.removeChild(e.firstChild);e.appendChild(t)}this.fire(`contentupdate`)}},_updatePosition:function(){if(this._map){var e=this._map.latLngToLayerPoint(this._latlng),t=D(this.options.offset),n=this._getAnchor();this._zoomAnimated?W(this._container,e.add(n)):t=t.add(e).add(n);var r=this._containerBottom=-t.y,i=this._containerLeft=-Math.round(this._containerWidth/2)+t.x;this._container.style.bottom=r+`px`,this._container.style.left=i+`px`}},_getAnchor:function(){return[0,0]}});Y.include({_initOverlay:function(e,t,n,r){var i=t;return i instanceof e||(i=new e(r).setContent(t)),n&&i.setLatLng(n),i}}),Gn.include({_initOverlay:function(e,t,n,r){var i=n;return i instanceof e?(p(i,r),i._source=this):(i=t&&!r?t:new e(r,this),i.setContent(n)),i}});var Ar=kr.extend({options:{pane:`popupPane`,offset:[0,7],maxWidth:300,minWidth:50,maxHeight:null,autoPan:!0,autoPanPaddingTopLeft:null,autoPanPaddingBottomRight:null,autoPanPadding:[5,5],keepInView:!1,closeButton:!0,autoClose:!0,closeOnEscapeKey:!0,className:``},openOn:function(e){return e=arguments.length?e:this._source._map,!e.hasLayer(this)&&e._popup&&e._popup.options.autoClose&&e.removeLayer(e._popup),e._popup=this,kr.prototype.openOn.call(this,e)},onAdd:function(e){kr.prototype.onAdd.call(this,e),e.fire(`popupopen`,{popup:this}),this._source&&(this._source.fire(`popupopen`,{popup:this},!0),this._source instanceof nr||this._source.on(`preclick`,Xt))},onRemove:function(e){kr.prototype.onRemove.call(this,e),e.fire(`popupclose`,{popup:this}),this._source&&(this._source.fire(`popupclose`,{popup:this},!0),this._source instanceof nr||this._source.off(`preclick`,Xt))},getEvents:function(){var e=kr.prototype.getEvents.call(this);return(this.options.closeOnClick===void 0?this._map.options.closePopupOnClick:this.options.closeOnClick)&&(e.preclick=this.close),this.options.keepInView&&(e.moveend=this._adjustPan),e},_initLayout:function(){var e=`leaflet-popup`,t=this._container=B(`div`,e+` `+(this.options.className||``)+` leaflet-zoom-animated`),n=this._wrapper=B(`div`,e+`-content-wrapper`,t);if(this._contentNode=B(`div`,e+`-content`,n),Qt(t),Zt(this._contentNode),K(t,`contextmenu`,Xt),this._tipContainer=B(`div`,e+`-tip-container`,t),this._tip=B(`div`,e+`-tip`,this._tipContainer),this.options.closeButton){var r=this._closeButton=B(`a`,e+`-close-button`,t);r.setAttribute(`role`,`button`),r.setAttribute(`aria-label`,`Close popup`),r.href=`#close`,r.innerHTML=`<span aria-hidden="true">&#215;</span>`,K(r,`click`,function(e){J(e),this.close()},this)}},_updateLayout:function(){var e=this._contentNode,t=e.style;t.width=``,t.whiteSpace=`nowrap`;var n=e.offsetWidth;n=Math.min(n,this.options.maxWidth),n=Math.max(n,this.options.minWidth),t.width=n+1+`px`,t.whiteSpace=``,t.height=``;var r=e.offsetHeight,i=this.options.maxHeight,a=`leaflet-popup-scrolled`;i&&r>i?(t.height=i+`px`,H(e,a)):U(e,a),this._containerWidth=this._container.offsetWidth},_animateZoom:function(e){var t=this._map._latLngToNewLayerPoint(this._latlng,e.zoom,e.center),n=this._getAnchor();W(this._container,t.add(n))},_adjustPan:function(){if(this.options.autoPan){if(this._map._panAnim&&this._map._panAnim.stop(),this._autopanning){this._autopanning=!1;return}var e=this._map,t=parseInt(xt(this._container,`marginBottom`),10)||0,n=this._container.offsetHeight+t,r=this._containerWidth,i=new E(this._containerLeft,-n-this._containerBottom);i._add(Mt(this._container));var a=e.layerPointToContainerPoint(i),o=D(this.options.autoPanPadding),s=D(this.options.autoPanPaddingTopLeft||o),c=D(this.options.autoPanPaddingBottomRight||o),l=e.getSize(),u=0,d=0;a.x+r+c.x>l.x&&(u=a.x+r-l.x+c.x),a.x-u-s.x<0&&(u=a.x-s.x),a.y+n+c.y>l.y&&(d=a.y+n-l.y+c.y),a.y-d-s.y<0&&(d=a.y-s.y),(u||d)&&(this.options.keepInView&&(this._autopanning=!0),e.fire(`autopanstart`).panBy([u,d]))}},_getAnchor:function(){return D(this._source&&this._source._getPopupAnchor?this._source._getPopupAnchor():[0,0])}}),jr=function(e,t){return new Ar(e,t)};Y.mergeOptions({closePopupOnClick:!0}),Y.include({openPopup:function(e,t,n){return this._initOverlay(Ar,e,t,n).openOn(this),this},closePopup:function(e){return e=arguments.length?e:this._popup,e&&e.close(),this}}),Gn.include({bindPopup:function(e,t){return this._popup=this._initOverlay(Ar,this._popup,e,t),this._popupHandlersAdded||=(this.on({click:this._openPopup,keypress:this._onKeyPress,remove:this.closePopup,move:this._movePopup}),!0),this},unbindPopup:function(){return this._popup&&=(this.off({click:this._openPopup,keypress:this._onKeyPress,remove:this.closePopup,move:this._movePopup}),this._popupHandlersAdded=!1,null),this},openPopup:function(e){return this._popup&&(this instanceof Jn||(this._popup._source=this),this._popup._prepareOpen(e||this._latlng)&&this._popup.openOn(this._map)),this},closePopup:function(){return this._popup&&this._popup.close(),this},togglePopup:function(){return this._popup&&this._popup.toggle(this),this},isPopupOpen:function(){return this._popup?this._popup.isOpen():!1},setPopupContent:function(e){return this._popup&&this._popup.setContent(e),this},getPopup:function(){return this._popup},_openPopup:function(e){if(!(!this._popup||!this._map)){$t(e);var t=e.layer||e.target;if(this._popup._source===t&&!(t instanceof nr)){this._map.hasLayer(this._popup)?this.closePopup():this.openPopup(e.latlng);return}this._popup._source=t,this.openPopup(e.latlng)}},_movePopup:function(e){this._popup.setLatLng(e.latlng)},_onKeyPress:function(e){e.originalEvent.keyCode===13&&this._openPopup(e)}});var Mr=kr.extend({options:{pane:`tooltipPane`,offset:[0,0],direction:`auto`,permanent:!1,sticky:!1,opacity:.9},onAdd:function(e){kr.prototype.onAdd.call(this,e),this.setOpacity(this.options.opacity),e.fire(`tooltipopen`,{tooltip:this}),this._source&&(this.addEventParent(this._source),this._source.fire(`tooltipopen`,{tooltip:this},!0))},onRemove:function(e){kr.prototype.onRemove.call(this,e),e.fire(`tooltipclose`,{tooltip:this}),this._source&&(this.removeEventParent(this._source),this._source.fire(`tooltipclose`,{tooltip:this},!0))},getEvents:function(){var e=kr.prototype.getEvents.call(this);return this.options.permanent||(e.preclick=this.close),e},_initLayout:function(){var e=`leaflet-tooltip `+(this.options.className||``)+` leaflet-zoom-`+(this._zoomAnimated?`animated`:`hide`);this._contentNode=this._container=B(`div`,e),this._container.setAttribute(`role`,`tooltip`),this._container.setAttribute(`id`,`leaflet-tooltip-`+o(this))},_updateLayout:function(){},_adjustPan:function(){},_setPosition:function(e){var t,n,r=this._map,i=this._container,a=r.latLngToContainerPoint(r.getCenter()),o=r.layerPointToContainerPoint(e),s=this.options.direction,c=i.offsetWidth,l=i.offsetHeight,u=D(this.options.offset),d=this._getAnchor();s===`top`?(t=c/2,n=l):s===`bottom`?(t=c/2,n=0):s===`center`?(t=c/2,n=l/2):s===`right`?(t=0,n=l/2):s===`left`?(t=c,n=l/2):o.x<a.x?(s=`right`,t=0,n=l/2):(s=`left`,t=c+(u.x+d.x)*2,n=l/2),e=e.subtract(D(t,n,!0)).add(u).add(d),U(i,`leaflet-tooltip-right`),U(i,`leaflet-tooltip-left`),U(i,`leaflet-tooltip-top`),U(i,`leaflet-tooltip-bottom`),H(i,`leaflet-tooltip-`+s),W(i,e)},_updatePosition:function(){var e=this._map.latLngToLayerPoint(this._latlng);this._setPosition(e)},setOpacity:function(e){this.options.opacity=e,this._container&&Ot(this._container,e)},_animateZoom:function(e){var t=this._map._latLngToNewLayerPoint(this._latlng,e.zoom,e.center);this._setPosition(t)},_getAnchor:function(){return D(this._source&&this._source._getTooltipAnchor&&!this.options.sticky?this._source._getTooltipAnchor():[0,0])}}),Nr=function(e,t){return new Mr(e,t)};Y.include({openTooltip:function(e,t,n){return this._initOverlay(Mr,e,t,n).openOn(this),this},closeTooltip:function(e){return e.close(),this}}),Gn.include({bindTooltip:function(e,t){return this._tooltip&&this.isTooltipOpen()&&this.unbindTooltip(),this._tooltip=this._initOverlay(Mr,this._tooltip,e,t),this._initTooltipInteractions(),this._tooltip.options.permanent&&this._map&&this._map.hasLayer(this)&&this.openTooltip(),this},unbindTooltip:function(){return this._tooltip&&=(this._initTooltipInteractions(!0),this.closeTooltip(),null),this},_initTooltipInteractions:function(e){if(!(!e&&this._tooltipHandlersAdded)){var t=e?`off`:`on`,n={remove:this.closeTooltip,move:this._moveTooltip};this._tooltip.options.permanent?n.add=this._openTooltip:(n.mouseover=this._openTooltip,n.mouseout=this.closeTooltip,n.click=this._openTooltip,this._map?this._addFocusListeners():n.add=this._addFocusListeners),this._tooltip.options.sticky&&(n.mousemove=this._moveTooltip),this[t](n),this._tooltipHandlersAdded=!e}},openTooltip:function(e){return this._tooltip&&(this instanceof Jn||(this._tooltip._source=this),this._tooltip._prepareOpen(e)&&(this._tooltip.openOn(this._map),this.getElement?this._setAriaDescribedByOnLayer(this):this.eachLayer&&this.eachLayer(this._setAriaDescribedByOnLayer,this))),this},closeTooltip:function(){if(this._tooltip)return this._tooltip.close()},toggleTooltip:function(){return this._tooltip&&this._tooltip.toggle(this),this},isTooltipOpen:function(){return this._tooltip.isOpen()},setTooltipContent:function(e){return this._tooltip&&this._tooltip.setContent(e),this},getTooltip:function(){return this._tooltip},_addFocusListeners:function(){this.getElement?this._addFocusListenersOnLayer(this):this.eachLayer&&this.eachLayer(this._addFocusListenersOnLayer,this)},_addFocusListenersOnLayer:function(e){var t=typeof e.getElement==`function`&&e.getElement();t&&(K(t,`focus`,function(){this._tooltip._source=e,this.openTooltip()},this),K(t,`blur`,this.closeTooltip,this))},_setAriaDescribedByOnLayer:function(e){var t=typeof e.getElement==`function`&&e.getElement();t&&t.setAttribute(`aria-describedby`,this._tooltip._container.id)},_openTooltip:function(e){if(!(!this._tooltip||!this._map)){if(this._map.dragging&&this._map.dragging.moving()&&!this._openOnceFlag){this._openOnceFlag=!0;var t=this;this._map.once(`moveend`,function(){t._openOnceFlag=!1,t._openTooltip(e)});return}this._tooltip._source=e.layer||e.target,this.openTooltip(this._tooltip.options.sticky?e.latlng:void 0)}},_moveTooltip:function(e){var t=e.latlng,n,r;this._tooltip.options.sticky&&e.originalEvent&&(n=this._map.mouseEventToContainerPoint(e.originalEvent),r=this._map.containerPointToLayerPoint(n),t=this._map.layerPointToLatLng(r)),this._tooltip.setLatLng(t)}});var Pr=Xn.extend({options:{iconSize:[12,12],html:!1,bgPos:null,className:`leaflet-div-icon`},createIcon:function(e){var t=e&&e.tagName===`DIV`?e:document.createElement(`div`),n=this.options;if(n.html instanceof Element?(St(t),t.appendChild(n.html)):t.innerHTML=n.html===!1?``:n.html,n.bgPos){var r=D(n.bgPos);t.style.backgroundPosition=-r.x+`px `+-r.y+`px`}return this._setIconStyles(t,`icon`),t},createShadow:function(){return null}});function Fr(e){return new Pr(e)}Xn.Default=Qn;var Ir=Gn.extend({options:{tileSize:256,opacity:1,updateWhenIdle:z.mobile,updateWhenZooming:!0,updateInterval:200,zIndex:1,bounds:null,minZoom:0,maxZoom:void 0,maxNativeZoom:void 0,minNativeZoom:void 0,noWrap:!1,pane:`tilePane`,className:``,keepBuffer:2},initialize:function(e){p(this,e)},onAdd:function(){this._initContainer(),this._levels={},this._tiles={},this._resetView()},beforeAdd:function(e){e._addZoomLimit(this)},onRemove:function(e){this._removeAllTiles(),V(this._container),e._removeZoomLimit(this),this._container=null,this._tileZoom=void 0},bringToFront:function(){return this._map&&(Ct(this._container),this._setAutoZIndex(Math.max)),this},bringToBack:function(){return this._map&&(wt(this._container),this._setAutoZIndex(Math.min)),this},getContainer:function(){return this._container},setOpacity:function(e){return this.options.opacity=e,this._updateOpacity(),this},setZIndex:function(e){return this.options.zIndex=e,this._updateZIndex(),this},isLoading:function(){return this._loading},redraw:function(){if(this._map){this._removeAllTiles();var e=this._clampZoom(this._map.getZoom());e!==this._tileZoom&&(this._tileZoom=e,this._updateLevels()),this._update()}return this},getEvents:function(){var e={viewprereset:this._invalidateAll,viewreset:this._resetView,zoom:this._resetView,moveend:this._onMoveEnd};return this.options.updateWhenIdle||(this._onMove||=s(this._onMoveEnd,this.options.updateInterval,this),e.move=this._onMove),this._zoomAnimated&&(e.zoomanim=this._animateZoom),e},createTile:function(){return document.createElement(`div`)},getTileSize:function(){var e=this.options.tileSize;return e instanceof E?e:new E(e,e)},_updateZIndex:function(){this._container&&this.options.zIndex!==void 0&&this.options.zIndex!==null&&(this._container.style.zIndex=this.options.zIndex)},_setAutoZIndex:function(e){for(var t=this.getPane().children,n=-e(-1/0,1/0),r=0,i=t.length,a;r<i;r++)a=t[r].style.zIndex,t[r]!==this._container&&a&&(n=e(n,+a));isFinite(n)&&(this.options.zIndex=n+e(-1,1),this._updateZIndex())},_updateOpacity:function(){if(this._map&&!z.ielt9){Ot(this._container,this.options.opacity);var e=+new Date,t=!1,n=!1;for(var r in this._tiles){var i=this._tiles[r];if(!(!i.current||!i.loaded)){var a=Math.min(1,(e-i.loaded)/200);Ot(i.el,a),a<1?t=!0:(i.active?n=!0:this._onOpaqueTile(i),i.active=!0)}}n&&!this._noPrune&&this._pruneTiles(),t&&(S(this._fadeFrame),this._fadeFrame=x(this._updateOpacity,this))}},_onOpaqueTile:l,_initContainer:function(){this._container||(this._container=B(`div`,`leaflet-layer `+(this.options.className||``)),this._updateZIndex(),this.options.opacity<1&&this._updateOpacity(),this.getPane().appendChild(this._container))},_updateLevels:function(){var e=this._tileZoom,t=this.options.maxZoom;if(e!==void 0){for(var n in this._levels)n=Number(n),this._levels[n].el.children.length||n===e?(this._levels[n].el.style.zIndex=t-Math.abs(e-n),this._onUpdateLevel(n)):(V(this._levels[n].el),this._removeTilesAtZoom(n),this._onRemoveLevel(n),delete this._levels[n]);var r=this._levels[e],i=this._map;return r||(r=this._levels[e]={},r.el=B(`div`,`leaflet-tile-container leaflet-zoom-animated`,this._container),r.el.style.zIndex=t,r.origin=i.project(i.unproject(i.getPixelOrigin()),e).round(),r.zoom=e,this._setZoomTransform(r,i.getCenter(),i.getZoom()),r.el.offsetWidth,this._onCreateLevel(r)),this._level=r,r}},_onUpdateLevel:l,_onRemoveLevel:l,_onCreateLevel:l,_pruneTiles:function(){if(this._map){var e,t,n=this._map.getZoom();if(n>this.options.maxZoom||n<this.options.minZoom){this._removeAllTiles();return}for(e in this._tiles)t=this._tiles[e],t.retain=t.current;for(e in this._tiles)if(t=this._tiles[e],t.current&&!t.active){var r=t.coords;this._retainParent(r.x,r.y,r.z,r.z-5)||this._retainChildren(r.x,r.y,r.z,r.z+2)}for(e in this._tiles)this._tiles[e].retain||this._removeTile(e)}},_removeTilesAtZoom:function(e){for(var t in this._tiles)this._tiles[t].coords.z===e&&this._removeTile(t)},_removeAllTiles:function(){for(var e in this._tiles)this._removeTile(e)},_invalidateAll:function(){for(var e in this._levels)V(this._levels[e].el),this._onRemoveLevel(Number(e)),delete this._levels[e];this._removeAllTiles(),this._tileZoom=void 0},_retainParent:function(e,t,n,r){var i=Math.floor(e/2),a=Math.floor(t/2),o=n-1,s=new E(+i,+a);s.z=+o;var c=this._tileCoordsToKey(s),l=this._tiles[c];return l&&l.active?(l.retain=!0,!0):(l&&l.loaded&&(l.retain=!0),o>r?this._retainParent(i,a,o,r):!1)},_retainChildren:function(e,t,n,r){for(var i=2*e;i<2*e+2;i++)for(var a=2*t;a<2*t+2;a++){var o=new E(i,a);o.z=n+1;var s=this._tileCoordsToKey(o),c=this._tiles[s];if(c&&c.active){c.retain=!0;continue}else c&&c.loaded&&(c.retain=!0);n+1<r&&this._retainChildren(i,a,n+1,r)}},_resetView:function(e){var t=e&&(e.pinch||e.flyTo);this._setView(this._map.getCenter(),this._map.getZoom(),t,t)},_animateZoom:function(e){this._setView(e.center,e.zoom,!0,e.noUpdate)},_clampZoom:function(e){var t=this.options;return t.minNativeZoom!==void 0&&e<t.minNativeZoom?t.minNativeZoom:t.maxNativeZoom!==void 0&&t.maxNativeZoom<e?t.maxNativeZoom:e},_setView:function(e,t,n,r){var i=Math.round(t);i=this.options.maxZoom!==void 0&&i>this.options.maxZoom||this.options.minZoom!==void 0&&i<this.options.minZoom?void 0:this._clampZoom(i);var a=this.options.updateWhenZooming&&i!==this._tileZoom;(!r||a)&&(this._tileZoom=i,this._abortLoading&&this._abortLoading(),this._updateLevels(),this._resetGrid(),i!==void 0&&this._update(e),n||this._pruneTiles(),this._noPrune=!!n),this._setZoomTransforms(e,t)},_setZoomTransforms:function(e,t){for(var n in this._levels)this._setZoomTransform(this._levels[n],e,t)},_setZoomTransform:function(e,t,n){var r=this._map.getZoomScale(n,e.zoom),i=e.origin.multiplyBy(r).subtract(this._map._getNewPixelOrigin(t,n)).round();z.any3d?jt(e.el,i,r):W(e.el,i)},_resetGrid:function(){var e=this._map,t=e.options.crs,n=this._tileSize=this.getTileSize(),r=this._tileZoom,i=this._map.getPixelWorldBounds(this._tileZoom);i&&(this._globalTileRange=this._pxBoundsToTileRange(i)),this._wrapX=t.wrapLng&&!this.options.noWrap&&[Math.floor(e.project([0,t.wrapLng[0]],r).x/n.x),Math.ceil(e.project([0,t.wrapLng[1]],r).x/n.y)],this._wrapY=t.wrapLat&&!this.options.noWrap&&[Math.floor(e.project([t.wrapLat[0],0],r).y/n.x),Math.ceil(e.project([t.wrapLat[1],0],r).y/n.y)]},_onMoveEnd:function(){!this._map||this._map._animatingZoom||this._update()},_getTiledPixelBounds:function(e){var t=this._map,n=t._animatingZoom?Math.max(t._animateToZoom,t.getZoom()):t.getZoom(),r=t.getZoomScale(n,this._tileZoom),i=t.project(e,this._tileZoom).floor(),a=t.getSize().divideBy(r*2);return new O(i.subtract(a),i.add(a))},_update:function(e){var t=this._map;if(t){var n=this._clampZoom(t.getZoom());if(e===void 0&&(e=t.getCenter()),this._tileZoom!==void 0){var r=this._getTiledPixelBounds(e),i=this._pxBoundsToTileRange(r),a=i.getCenter(),o=[],s=this.options.keepBuffer,c=new O(i.getBottomLeft().subtract([s,-s]),i.getTopRight().add([s,-s]));if(!(isFinite(i.min.x)&&isFinite(i.min.y)&&isFinite(i.max.x)&&isFinite(i.max.y)))throw Error(`Attempted to load an infinite number of tiles`);for(var l in this._tiles){var u=this._tiles[l].coords;(u.z!==this._tileZoom||!c.contains(new E(u.x,u.y)))&&(this._tiles[l].current=!1)}if(Math.abs(n-this._tileZoom)>1){this._setView(e,n);return}for(var d=i.min.y;d<=i.max.y;d++)for(var f=i.min.x;f<=i.max.x;f++){var p=new E(f,d);if(p.z=this._tileZoom,this._isValidTile(p)){var m=this._tiles[this._tileCoordsToKey(p)];m?m.current=!0:o.push(p)}}if(o.sort(function(e,t){return e.distanceTo(a)-t.distanceTo(a)}),o.length!==0){this._loading||(this._loading=!0,this.fire(`loading`));var h=document.createDocumentFragment();for(f=0;f<o.length;f++)this._addTile(o[f],h);this._level.el.appendChild(h)}}}},_isValidTile:function(e){var t=this._map.options.crs;if(!t.infinite){var n=this._globalTileRange;if(!t.wrapLng&&(e.x<n.min.x||e.x>n.max.x)||!t.wrapLat&&(e.y<n.min.y||e.y>n.max.y))return!1}if(!this.options.bounds)return!0;var r=this._tileCoordsToBounds(e);return j(this.options.bounds).overlaps(r)},_keyToBounds:function(e){return this._tileCoordsToBounds(this._keyToTileCoords(e))},_tileCoordsToNwSe:function(e){var t=this._map,n=this.getTileSize(),r=e.scaleBy(n),i=r.add(n);return[t.unproject(r,e.z),t.unproject(i,e.z)]},_tileCoordsToBounds:function(e){var t=this._tileCoordsToNwSe(e),n=new A(t[0],t[1]);return this.options.noWrap||(n=this._map.wrapLatLngBounds(n)),n},_tileCoordsToKey:function(e){return e.x+`:`+e.y+`:`+e.z},_keyToTileCoords:function(e){var t=e.split(`:`),n=new E(+t[0],+t[1]);return n.z=+t[2],n},_removeTile:function(e){var t=this._tiles[e];t&&(V(t.el),delete this._tiles[e],this.fire(`tileunload`,{tile:t.el,coords:this._keyToTileCoords(e)}))},_initTile:function(e){H(e,`leaflet-tile`);var t=this.getTileSize();e.style.width=t.x+`px`,e.style.height=t.y+`px`,e.onselectstart=l,e.onmousemove=l,z.ielt9&&this.options.opacity<1&&Ot(e,this.options.opacity)},_addTile:function(e,t){var n=this._getTilePos(e),r=this._tileCoordsToKey(e),a=this.createTile(this._wrapCoords(e),i(this._tileReady,this,e));this._initTile(a),this.createTile.length<2&&x(i(this._tileReady,this,e,null,a)),W(a,n),this._tiles[r]={el:a,coords:e,current:!0},t.appendChild(a),this.fire(`tileloadstart`,{tile:a,coords:e})},_tileReady:function(e,t,n){t&&this.fire(`tileerror`,{error:t,tile:n,coords:e});var r=this._tileCoordsToKey(e);n=this._tiles[r],n&&(n.loaded=+new Date,this._map._fadeAnimated?(Ot(n.el,0),S(this._fadeFrame),this._fadeFrame=x(this._updateOpacity,this)):(n.active=!0,this._pruneTiles()),t||(H(n.el,`leaflet-tile-loaded`),this.fire(`tileload`,{tile:n.el,coords:e})),this._noTilesToLoad()&&(this._loading=!1,this.fire(`load`),z.ielt9||!this._map._fadeAnimated?x(this._pruneTiles,this):setTimeout(i(this._pruneTiles,this),250)))},_getTilePos:function(e){return e.scaleBy(this.getTileSize()).subtract(this._level.origin)},_wrapCoords:function(e){var t=new E(this._wrapX?c(e.x,this._wrapX):e.x,this._wrapY?c(e.y,this._wrapY):e.y);return t.z=e.z,t},_pxBoundsToTileRange:function(e){var t=this.getTileSize();return new O(e.min.unscaleBy(t).floor(),e.max.unscaleBy(t).ceil().subtract([1,1]))},_noTilesToLoad:function(){for(var e in this._tiles)if(!this._tiles[e].loaded)return!1;return!0}});function Lr(e){return new Ir(e)}var Rr=Ir.extend({options:{minZoom:0,maxZoom:18,subdomains:`abc`,errorTileUrl:``,zoomOffset:0,tms:!1,zoomReverse:!1,detectRetina:!1,crossOrigin:!1,referrerPolicy:!1},initialize:function(e,t){this._url=e,t=p(this,t),t.detectRetina&&z.retina&&t.maxZoom>0?(t.tileSize=Math.floor(t.tileSize/2),t.zoomReverse?(t.zoomOffset--,t.minZoom=Math.min(t.maxZoom,t.minZoom+1)):(t.zoomOffset++,t.maxZoom=Math.max(t.minZoom,t.maxZoom-1)),t.minZoom=Math.max(0,t.minZoom)):t.zoomReverse?t.minZoom=Math.min(t.maxZoom,t.minZoom):t.maxZoom=Math.max(t.minZoom,t.maxZoom),typeof t.subdomains==`string`&&(t.subdomains=t.subdomains.split(``)),this.on(`tileunload`,this._onTileRemove)},setUrl:function(e,t){return this._url===e&&t===void 0&&(t=!0),this._url=e,t||this.redraw(),this},createTile:function(e,t){var n=document.createElement(`img`);return K(n,`load`,i(this._tileOnLoad,this,t,n)),K(n,`error`,i(this._tileOnError,this,t,n)),(this.options.crossOrigin||this.options.crossOrigin===``)&&(n.crossOrigin=this.options.crossOrigin===!0?``:this.options.crossOrigin),typeof this.options.referrerPolicy==`string`&&(n.referrerPolicy=this.options.referrerPolicy),n.alt=``,n.src=this.getTileUrl(e),n},getTileUrl:function(e){var t={r:z.retina?`@2x`:``,s:this._getSubdomain(e),x:e.x,y:e.y,z:this._getZoomForUrl()};if(this._map&&!this._map.options.crs.infinite){var r=this._globalTileRange.max.y-e.y;this.options.tms&&(t.y=r),t[`-y`]=r}return g(this._url,n(t,this.options))},_tileOnLoad:function(e,t){z.ielt9?setTimeout(i(e,this,null,t),0):e(null,t)},_tileOnError:function(e,t,n){var r=this.options.errorTileUrl;r&&t.getAttribute(`src`)!==r&&(t.src=r),e(n,t)},_onTileRemove:function(e){e.tile.onload=null},_getZoomForUrl:function(){var e=this._tileZoom,t=this.options.maxZoom,n=this.options.zoomReverse,r=this.options.zoomOffset;return n&&(e=t-e),e+r},_getSubdomain:function(e){var t=Math.abs(e.x+e.y)%this.options.subdomains.length;return this.options.subdomains[t]},_abortLoading:function(){var e,t;for(e in this._tiles)if(this._tiles[e].coords.z!==this._tileZoom&&(t=this._tiles[e].el,t.onload=l,t.onerror=l,!t.complete)){t.src=te;var n=this._tiles[e].coords;V(t),delete this._tiles[e],this.fire(`tileabort`,{tile:t,coords:n})}},_removeTile:function(e){var t=this._tiles[e];if(t)return t.el.setAttribute(`src`,te),Ir.prototype._removeTile.call(this,e)},_tileReady:function(e,t,n){if(!(!this._map||n&&n.getAttribute(`src`)===te))return Ir.prototype._tileReady.call(this,e,t,n)}});function zr(e,t){return new Rr(e,t)}var Br=Rr.extend({defaultWmsParams:{service:`WMS`,request:`GetMap`,layers:``,styles:``,format:`image/jpeg`,transparent:!1,version:`1.1.1`},options:{crs:null,uppercase:!1},initialize:function(e,t){this._url=e;var r=n({},this.defaultWmsParams);for(var i in t)i in this.options||(r[i]=t[i]);t=p(this,t);var a=t.detectRetina&&z.retina?2:1,o=this.getTileSize();r.width=o.x*a,r.height=o.y*a,this.wmsParams=r},onAdd:function(e){this._crs=this.options.crs||e.options.crs,this._wmsVersion=parseFloat(this.wmsParams.version);var t=this._wmsVersion>=1.3?`crs`:`srs`;this.wmsParams[t]=this._crs.code,Rr.prototype.onAdd.call(this,e)},getTileUrl:function(e){var t=this._tileCoordsToNwSe(e),n=this._crs,r=k(n.project(t[0]),n.project(t[1])),i=r.min,a=r.max,o=(this._wmsVersion>=1.3&&this._crs===Un?[i.y,i.x,a.y,a.x]:[i.x,i.y,a.x,a.y]).join(`,`),s=Rr.prototype.getTileUrl.call(this,e);return s+m(this.wmsParams,s,this.options.uppercase)+(this.options.uppercase?`&BBOX=`:`&bbox=`)+o},setParams:function(e,t){return n(this.wmsParams,e),t||this.redraw(),this}});function Vr(e,t){return new Br(e,t)}Rr.WMS=Br,zr.wms=Vr;var Hr=Gn.extend({options:{padding:.1},initialize:function(e){p(this,e),o(this),this._layers=this._layers||{}},onAdd:function(){this._container||(this._initContainer(),H(this._container,`leaflet-zoom-animated`)),this.getPane().appendChild(this._container),this._update(),this.on(`update`,this._updatePaths,this)},onRemove:function(){this.off(`update`,this._updatePaths,this),this._destroyContainer()},getEvents:function(){var e={viewreset:this._reset,zoom:this._onZoom,moveend:this._update,zoomend:this._onZoomEnd};return this._zoomAnimated&&(e.zoomanim=this._onAnimZoom),e},_onAnimZoom:function(e){this._updateTransform(e.center,e.zoom)},_onZoom:function(){this._updateTransform(this._map.getCenter(),this._map.getZoom())},_updateTransform:function(e,t){var n=this._map.getZoomScale(t,this._zoom),r=this._map.getSize().multiplyBy(.5+this.options.padding),i=this._map.project(this._center,t),a=r.multiplyBy(-n).add(i).subtract(this._map._getNewPixelOrigin(e,t));z.any3d?jt(this._container,a,n):W(this._container,a)},_reset:function(){for(var e in this._update(),this._updateTransform(this._center,this._zoom),this._layers)this._layers[e]._reset()},_onZoomEnd:function(){for(var e in this._layers)this._layers[e]._project()},_updatePaths:function(){for(var e in this._layers)this._layers[e]._update()},_update:function(){var e=this.options.padding,t=this._map.getSize(),n=this._map.containerPointToLayerPoint(t.multiplyBy(-e)).round();this._bounds=new O(n,n.add(t.multiplyBy(1+e*2)).round()),this._center=this._map.getCenter(),this._zoom=this._map.getZoom()}}),Ur=Hr.extend({options:{tolerance:0},getEvents:function(){var e=Hr.prototype.getEvents.call(this);return e.viewprereset=this._onViewPreReset,e},_onViewPreReset:function(){this._postponeUpdatePaths=!0},onAdd:function(){Hr.prototype.onAdd.call(this),this._draw()},_initContainer:function(){var e=this._container=document.createElement(`canvas`);K(e,`mousemove`,this._onMouseMove,this),K(e,`click dblclick mousedown mouseup contextmenu`,this._onClick,this),K(e,`mouseout`,this._handleMouseOut,this),e._leaflet_disable_events=!0,this._ctx=e.getContext(`2d`)},_destroyContainer:function(){S(this._redrawRequest),delete this._ctx,V(this._container),q(this._container),delete this._container},_updatePaths:function(){if(!this._postponeUpdatePaths){var e;for(var t in this._redrawBounds=null,this._layers)e=this._layers[t],e._update();this._redraw()}},_update:function(){if(!(this._map._animatingZoom&&this._bounds)){Hr.prototype._update.call(this);var e=this._bounds,t=this._container,n=e.getSize(),r=z.retina?2:1;W(t,e.min),t.width=r*n.x,t.height=r*n.y,t.style.width=n.x+`px`,t.style.height=n.y+`px`,z.retina&&this._ctx.scale(2,2),this._ctx.translate(-e.min.x,-e.min.y),this.fire(`update`)}},_reset:function(){Hr.prototype._reset.call(this),this._postponeUpdatePaths&&(this._postponeUpdatePaths=!1,this._updatePaths())},_initPath:function(e){this._updateDashArray(e),this._layers[o(e)]=e;var t=e._order={layer:e,prev:this._drawLast,next:null};this._drawLast&&(this._drawLast.next=t),this._drawLast=t,this._drawFirst=this._drawFirst||this._drawLast},_addPath:function(e){this._requestRedraw(e)},_removePath:function(e){var t=e._order,n=t.next,r=t.prev;n?n.prev=r:this._drawLast=r,r?r.next=n:this._drawFirst=n,delete e._order,delete this._layers[o(e)],this._requestRedraw(e)},_updatePath:function(e){this._extendRedrawBounds(e),e._project(),e._update(),this._requestRedraw(e)},_updateStyle:function(e){this._updateDashArray(e),this._requestRedraw(e)},_updateDashArray:function(e){if(typeof e.options.dashArray==`string`){var t=e.options.dashArray.split(/[, ]+/),n=[],r,i;for(i=0;i<t.length;i++){if(r=Number(t[i]),isNaN(r))return;n.push(r)}e.options._dashArray=n}else e.options._dashArray=e.options.dashArray},_requestRedraw:function(e){this._map&&(this._extendRedrawBounds(e),this._redrawRequest=this._redrawRequest||x(this._redraw,this))},_extendRedrawBounds:function(e){if(e._pxBounds){var t=(e.options.weight||0)+1;this._redrawBounds=this._redrawBounds||new O,this._redrawBounds.extend(e._pxBounds.min.subtract([t,t])),this._redrawBounds.extend(e._pxBounds.max.add([t,t]))}},_redraw:function(){this._redrawRequest=null,this._redrawBounds&&(this._redrawBounds.min._floor(),this._redrawBounds.max._ceil()),this._clear(),this._draw(),this._redrawBounds=null},_clear:function(){var e=this._redrawBounds;if(e){var t=e.getSize();this._ctx.clearRect(e.min.x,e.min.y,t.x,t.y)}else this._ctx.save(),this._ctx.setTransform(1,0,0,1,0,0),this._ctx.clearRect(0,0,this._container.width,this._container.height),this._ctx.restore()},_draw:function(){var e,t=this._redrawBounds;if(this._ctx.save(),t){var n=t.getSize();this._ctx.beginPath(),this._ctx.rect(t.min.x,t.min.y,n.x,n.y),this._ctx.clip()}this._drawing=!0;for(var r=this._drawFirst;r;r=r.next)e=r.layer,(!t||e._pxBounds&&e._pxBounds.intersects(t))&&e._updatePath();this._drawing=!1,this._ctx.restore()},_updatePoly:function(e,t){if(this._drawing){var n,r,i,a,o=e._parts,s=o.length,c=this._ctx;if(s){for(c.beginPath(),n=0;n<s;n++){for(r=0,i=o[n].length;r<i;r++)a=o[n][r],c[r?`lineTo`:`moveTo`](a.x,a.y);t&&c.closePath()}this._fillStroke(c,e)}}},_updateCircle:function(e){if(!(!this._drawing||e._empty())){var t=e._point,n=this._ctx,r=Math.max(Math.round(e._radius),1),i=(Math.max(Math.round(e._radiusY),1)||r)/r;i!==1&&(n.save(),n.scale(1,i)),n.beginPath(),n.arc(t.x,t.y/i,r,0,Math.PI*2,!1),i!==1&&n.restore(),this._fillStroke(n,e)}},_fillStroke:function(e,t){var n=t.options;n.fill&&(e.globalAlpha=n.fillOpacity,e.fillStyle=n.fillColor||n.color,e.fill(n.fillRule||`evenodd`)),n.stroke&&n.weight!==0&&(e.setLineDash&&e.setLineDash(t.options&&t.options._dashArray||[]),e.globalAlpha=n.opacity,e.lineWidth=n.weight,e.strokeStyle=n.color,e.lineCap=n.lineCap,e.lineJoin=n.lineJoin,e.stroke())},_onClick:function(e){for(var t=this._map.mouseEventToLayerPoint(e),n,r,i=this._drawFirst;i;i=i.next)n=i.layer,n.options.interactive&&n._containsPoint(t)&&(!(e.type===`click`||e.type===`preclick`)||!this._map._draggableMoved(n))&&(r=n);this._fireEvent(r?[r]:!1,e)},_onMouseMove:function(e){if(!(!this._map||this._map.dragging.moving()||this._map._animatingZoom)){var t=this._map.mouseEventToLayerPoint(e);this._handleMouseHover(e,t)}},_handleMouseOut:function(e){var t=this._hoveredLayer;t&&(U(this._container,`leaflet-interactive`),this._fireEvent([t],e,`mouseout`),this._hoveredLayer=null,this._mouseHoverThrottled=!1)},_handleMouseHover:function(e,t){if(!this._mouseHoverThrottled){for(var n,r,a=this._drawFirst;a;a=a.next)n=a.layer,n.options.interactive&&n._containsPoint(t)&&(r=n);r!==this._hoveredLayer&&(this._handleMouseOut(e),r&&(H(this._container,`leaflet-interactive`),this._fireEvent([r],e,`mouseover`),this._hoveredLayer=r)),this._fireEvent(this._hoveredLayer?[this._hoveredLayer]:!1,e),this._mouseHoverThrottled=!0,setTimeout(i(function(){this._mouseHoverThrottled=!1},this),32)}},_fireEvent:function(e,t,n){this._map._fireDOMEvent(t,n||t.type,e)},_bringToFront:function(e){var t=e._order;if(t){var n=t.next,r=t.prev;if(n)n.prev=r;else return;r?r.next=n:n&&(this._drawFirst=n),t.prev=this._drawLast,this._drawLast.next=t,t.next=null,this._drawLast=t,this._requestRedraw(e)}},_bringToBack:function(e){var t=e._order;if(t){var n=t.next,r=t.prev;if(r)r.next=n;else return;n?n.prev=r:r&&(this._drawLast=r),t.prev=null,t.next=this._drawFirst,this._drawFirst.prev=t,this._drawFirst=t,this._requestRedraw(e)}}});function Wr(e){return z.canvas?new Ur(e):null}var Gr=(function(){try{return document.namespaces.add(`lvml`,`urn:schemas-microsoft-com:vml`),function(e){return document.createElement(`<lvml:`+e+` class="lvml">`)}}catch{}return function(e){return document.createElement(`<`+e+` xmlns="urn:schemas-microsoft.com:vml" class="lvml">`)}})(),Kr={_initContainer:function(){this._container=B(`div`,`leaflet-vml-container`)},_update:function(){this._map._animatingZoom||(Hr.prototype._update.call(this),this.fire(`update`))},_initPath:function(e){var t=e._container=Gr(`shape`);H(t,`leaflet-vml-shape `+(this.options.className||``)),t.coordsize=`1 1`,e._path=Gr(`path`),t.appendChild(e._path),this._updateStyle(e),this._layers[o(e)]=e},_addPath:function(e){var t=e._container;this._container.appendChild(t),e.options.interactive&&e.addInteractiveTarget(t)},_removePath:function(e){var t=e._container;V(t),e.removeInteractiveTarget(t),delete this._layers[o(e)]},_updateStyle:function(e){var t=e._stroke,n=e._fill,r=e.options,i=e._container;i.stroked=!!r.stroke,i.filled=!!r.fill,r.stroke?(t||=e._stroke=Gr(`stroke`),i.appendChild(t),t.weight=r.weight+`px`,t.color=r.color,t.opacity=r.opacity,r.dashArray?t.dashStyle=_(r.dashArray)?r.dashArray.join(` `):r.dashArray.replace(/( *, *)/g,` `):t.dashStyle=``,t.endcap=r.lineCap.replace(`butt`,`flat`),t.joinstyle=r.lineJoin):t&&(i.removeChild(t),e._stroke=null),r.fill?(n||=e._fill=Gr(`fill`),i.appendChild(n),n.color=r.fillColor||r.color,n.opacity=r.fillOpacity):n&&(i.removeChild(n),e._fill=null)},_updateCircle:function(e){var t=e._point.round(),n=Math.round(e._radius),r=Math.round(e._radiusY||n);this._setPath(e,e._empty()?`M0 0`:`AL `+t.x+`,`+t.y+` `+n+`,`+r+` 0,23592600`)},_setPath:function(e,t){e._path.v=t},_bringToFront:function(e){Ct(e._container)},_bringToBack:function(e){wt(e._container)}},qr=z.vml?Gr:me,Jr=Hr.extend({_initContainer:function(){this._container=qr(`svg`),this._container.setAttribute(`pointer-events`,`none`),this._rootGroup=qr(`g`),this._container.appendChild(this._rootGroup)},_destroyContainer:function(){V(this._container),q(this._container),delete this._container,delete this._rootGroup,delete this._svgSize},_update:function(){if(!(this._map._animatingZoom&&this._bounds)){Hr.prototype._update.call(this);var e=this._bounds,t=e.getSize(),n=this._container;(!this._svgSize||!this._svgSize.equals(t))&&(this._svgSize=t,n.setAttribute(`width`,t.x),n.setAttribute(`height`,t.y)),W(n,e.min),n.setAttribute(`viewBox`,[e.min.x,e.min.y,t.x,t.y].join(` `)),this.fire(`update`)}},_initPath:function(e){var t=e._path=qr(`path`);e.options.className&&H(t,e.options.className),e.options.interactive&&H(t,`leaflet-interactive`),this._updateStyle(e),this._layers[o(e)]=e},_addPath:function(e){this._rootGroup||this._initContainer(),this._rootGroup.appendChild(e._path),e.addInteractiveTarget(e._path)},_removePath:function(e){V(e._path),e.removeInteractiveTarget(e._path),delete this._layers[o(e)]},_updatePath:function(e){e._project(),e._update()},_updateStyle:function(e){var t=e._path,n=e.options;t&&(n.stroke?(t.setAttribute(`stroke`,n.color),t.setAttribute(`stroke-opacity`,n.opacity),t.setAttribute(`stroke-width`,n.weight),t.setAttribute(`stroke-linecap`,n.lineCap),t.setAttribute(`stroke-linejoin`,n.lineJoin),n.dashArray?t.setAttribute(`stroke-dasharray`,n.dashArray):t.removeAttribute(`stroke-dasharray`),n.dashOffset?t.setAttribute(`stroke-dashoffset`,n.dashOffset):t.removeAttribute(`stroke-dashoffset`)):t.setAttribute(`stroke`,`none`),n.fill?(t.setAttribute(`fill`,n.fillColor||n.color),t.setAttribute(`fill-opacity`,n.fillOpacity),t.setAttribute(`fill-rule`,n.fillRule||`evenodd`)):t.setAttribute(`fill`,`none`))},_updatePoly:function(e,t){this._setPath(e,he(e._parts,t))},_updateCircle:function(e){var t=e._point,n=Math.max(Math.round(e._radius),1),r=Math.max(Math.round(e._radiusY),1)||n,i=`a`+n+`,`+r+` 0 1,0 `,a=e._empty()?`M0 0`:`M`+(t.x-n)+`,`+t.y+i+n*2+`,0 `+i+-n*2+`,0 `;this._setPath(e,a)},_setPath:function(e,t){e._path.setAttribute(`d`,t)},_bringToFront:function(e){Ct(e._path)},_bringToBack:function(e){wt(e._path)}});z.vml&&Jr.include(Kr);function Yr(e){return z.svg||z.vml?new Jr(e):null}Y.include({getRenderer:function(e){var t=e.options.renderer||this._getPaneRenderer(e.options.pane)||this.options.renderer||this._renderer;return t||=this._renderer=this._createRenderer(),this.hasLayer(t)||this.addLayer(t),t},_getPaneRenderer:function(e){if(e===`overlayPane`||e===void 0)return!1;var t=this._paneRenderers[e];return t===void 0&&(t=this._createRenderer({pane:e}),this._paneRenderers[e]=t),t},_createRenderer:function(e){return this.options.preferCanvas&&Wr(e)||Yr(e)}});var Xr=lr.extend({initialize:function(e,t){lr.prototype.initialize.call(this,this._boundsToLatLngs(e),t)},setBounds:function(e){return this.setLatLngs(this._boundsToLatLngs(e))},_boundsToLatLngs:function(e){return e=j(e),[e.getSouthWest(),e.getNorthWest(),e.getNorthEast(),e.getSouthEast()]}});function Zr(e,t){return new Xr(e,t)}Jr.create=qr,Jr.pointsToPath=he,dr.geometryToLayer=fr,dr.coordsToLatLng=mr,dr.coordsToLatLngs=hr,dr.latLngToCoords=gr,dr.latLngsToCoords=_r,dr.getFeature=vr,dr.asFeature=yr,Y.mergeOptions({boxZoom:!0});var Qr=Z.extend({initialize:function(e){this._map=e,this._container=e._container,this._pane=e._panes.overlayPane,this._resetStateTimeout=0,e.on(`unload`,this._destroy,this)},addHooks:function(){K(this._container,`mousedown`,this._onMouseDown,this)},removeHooks:function(){q(this._container,`mousedown`,this._onMouseDown,this)},moved:function(){return this._moved},_destroy:function(){V(this._pane),delete this._pane},_resetState:function(){this._resetStateTimeout=0,this._moved=!1},_clearDeferredResetState:function(){this._resetStateTimeout!==0&&(clearTimeout(this._resetStateTimeout),this._resetStateTimeout=0)},_onMouseDown:function(e){if(!e.shiftKey||e.which!==1&&e.button!==1)return!1;this._clearDeferredResetState(),this._resetState(),Nt(),It(),this._startPoint=this._map.mouseEventToContainerPoint(e),K(document,{contextmenu:$t,mousemove:this._onMouseMove,mouseup:this._onMouseUp,keydown:this._onKeyDown},this)},_onMouseMove:function(e){this._moved||(this._moved=!0,this._box=B(`div`,`leaflet-zoom-box`,this._container),H(this._container,`leaflet-crosshair`),this._map.fire(`boxzoomstart`)),this._point=this._map.mouseEventToContainerPoint(e);var t=new O(this._point,this._startPoint),n=t.getSize();W(this._box,t.min),this._box.style.width=n.x+`px`,this._box.style.height=n.y+`px`},_finish:function(){this._moved&&(V(this._box),U(this._container,`leaflet-crosshair`)),G(),Lt(),q(document,{contextmenu:$t,mousemove:this._onMouseMove,mouseup:this._onMouseUp,keydown:this._onKeyDown},this)},_onMouseUp:function(e){if(!(e.which!==1&&e.button!==1)&&(this._finish(),this._moved)){this._clearDeferredResetState(),this._resetStateTimeout=setTimeout(i(this._resetState,this),0);var t=new A(this._map.containerPointToLatLng(this._startPoint),this._map.containerPointToLatLng(this._point));this._map.fitBounds(t).fire(`boxzoomend`,{boxZoomBounds:t})}},_onKeyDown:function(e){e.keyCode===27&&(this._finish(),this._clearDeferredResetState(),this._resetState())}});Y.addInitHook(`addHandler`,`boxZoom`,Qr),Y.mergeOptions({doubleClickZoom:!0});var $r=Z.extend({addHooks:function(){this._map.on(`dblclick`,this._onDoubleClick,this)},removeHooks:function(){this._map.off(`dblclick`,this._onDoubleClick,this)},_onDoubleClick:function(e){var t=this._map,n=t.getZoom(),r=t.options.zoomDelta,i=e.originalEvent.shiftKey?n-r:n+r;t.options.doubleClickZoom===`center`?t.setZoom(i):t.setZoomAround(e.containerPoint,i)}});Y.addInitHook(`addHandler`,`doubleClickZoom`,$r),Y.mergeOptions({dragging:!0,inertia:!0,inertiaDeceleration:3400,inertiaMaxSpeed:1/0,easeLinearity:.2,worldCopyJump:!1,maxBoundsViscosity:0});var ei=Z.extend({addHooks:function(){if(!this._draggable){var e=this._map;this._draggable=new yn(e._mapPane,e._container),this._draggable.on({dragstart:this._onDragStart,drag:this._onDrag,dragend:this._onDragEnd},this),this._draggable.on(`predrag`,this._onPreDragLimit,this),e.options.worldCopyJump&&(this._draggable.on(`predrag`,this._onPreDragWrap,this),e.on(`zoomend`,this._onZoomEnd,this),e.whenReady(this._onZoomEnd,this))}H(this._map._container,`leaflet-grab leaflet-touch-drag`),this._draggable.enable(),this._positions=[],this._times=[]},removeHooks:function(){U(this._map._container,`leaflet-grab`),U(this._map._container,`leaflet-touch-drag`),this._draggable.disable()},moved:function(){return this._draggable&&this._draggable._moved},moving:function(){return this._draggable&&this._draggable._moving},_onDragStart:function(){var e=this._map;if(e._stop(),this._map.options.maxBounds&&this._map.options.maxBoundsViscosity){var t=j(this._map.options.maxBounds);this._offsetLimit=k(this._map.latLngToContainerPoint(t.getNorthWest()).multiplyBy(-1),this._map.latLngToContainerPoint(t.getSouthEast()).multiplyBy(-1).add(this._map.getSize())),this._viscosity=Math.min(1,Math.max(0,this._map.options.maxBoundsViscosity))}else this._offsetLimit=null;e.fire(`movestart`).fire(`dragstart`),e.options.inertia&&(this._positions=[],this._times=[])},_onDrag:function(e){if(this._map.options.inertia){var t=this._lastTime=+new Date,n=this._lastPos=this._draggable._absPos||this._draggable._newPos;this._positions.push(n),this._times.push(t),this._prunePositions(t)}this._map.fire(`move`,e).fire(`drag`,e)},_prunePositions:function(e){for(;this._positions.length>1&&e-this._times[0]>50;)this._positions.shift(),this._times.shift()},_onZoomEnd:function(){var e=this._map.getSize().divideBy(2),t=this._map.latLngToLayerPoint([0,0]);this._initialWorldOffset=t.subtract(e).x,this._worldWidth=this._map.getPixelWorldBounds().getSize().x},_viscousLimit:function(e,t){return e-(e-t)*this._viscosity},_onPreDragLimit:function(){if(!(!this._viscosity||!this._offsetLimit)){var e=this._draggable._newPos.subtract(this._draggable._startPos),t=this._offsetLimit;e.x<t.min.x&&(e.x=this._viscousLimit(e.x,t.min.x)),e.y<t.min.y&&(e.y=this._viscousLimit(e.y,t.min.y)),e.x>t.max.x&&(e.x=this._viscousLimit(e.x,t.max.x)),e.y>t.max.y&&(e.y=this._viscousLimit(e.y,t.max.y)),this._draggable._newPos=this._draggable._startPos.add(e)}},_onPreDragWrap:function(){var e=this._worldWidth,t=Math.round(e/2),n=this._initialWorldOffset,r=this._draggable._newPos.x,i=(r-t+n)%e+t-n,a=(r+t+n)%e-t-n,o=Math.abs(i+n)<Math.abs(a+n)?i:a;this._draggable._absPos=this._draggable._newPos.clone(),this._draggable._newPos.x=o},_onDragEnd:function(e){var t=this._map,n=t.options,r=!n.inertia||e.noInertia||this._times.length<2;if(t.fire(`dragend`,e),r)t.fire(`moveend`);else{this._prunePositions(+new Date);var i=this._lastPos.subtract(this._positions[0]),a=(this._lastTime-this._times[0])/1e3,o=n.easeLinearity,s=i.multiplyBy(o/a),c=s.distanceTo([0,0]),l=Math.min(n.inertiaMaxSpeed,c),u=s.multiplyBy(l/c),d=l/(n.inertiaDeceleration*o),f=u.multiplyBy(-d/2).round();!f.x&&!f.y?t.fire(`moveend`):(f=t._limitOffset(f,t.options.maxBounds),x(function(){t.panBy(f,{duration:d,easeLinearity:o,noMoveStart:!0,animate:!0})}))}}});Y.addInitHook(`addHandler`,`dragging`,ei),Y.mergeOptions({keyboard:!0,keyboardPanDelta:80});var ti=Z.extend({keyCodes:{left:[37],right:[39],down:[40],up:[38],zoomIn:[187,107,61,171],zoomOut:[189,109,54,173]},initialize:function(e){this._map=e,this._setPanDelta(e.options.keyboardPanDelta),this._setZoomDelta(e.options.zoomDelta)},addHooks:function(){var e=this._map._container;e.tabIndex<=0&&(e.tabIndex=`0`),K(e,{focus:this._onFocus,blur:this._onBlur,mousedown:this._onMouseDown},this),this._map.on({focus:this._addHooks,blur:this._removeHooks},this)},removeHooks:function(){this._removeHooks(),q(this._map._container,{focus:this._onFocus,blur:this._onBlur,mousedown:this._onMouseDown},this),this._map.off({focus:this._addHooks,blur:this._removeHooks},this)},_onMouseDown:function(){if(!this._focused){var e=document.body,t=document.documentElement,n=e.scrollTop||t.scrollTop,r=e.scrollLeft||t.scrollLeft;this._map._container.focus(),window.scrollTo(r,n)}},_onFocus:function(){this._focused=!0,this._map.fire(`focus`)},_onBlur:function(){this._focused=!1,this._map.fire(`blur`)},_setPanDelta:function(e){var t=this._panKeys={},n=this.keyCodes,r,i;for(r=0,i=n.left.length;r<i;r++)t[n.left[r]]=[-1*e,0];for(r=0,i=n.right.length;r<i;r++)t[n.right[r]]=[e,0];for(r=0,i=n.down.length;r<i;r++)t[n.down[r]]=[0,e];for(r=0,i=n.up.length;r<i;r++)t[n.up[r]]=[0,-1*e]},_setZoomDelta:function(e){var t=this._zoomKeys={},n=this.keyCodes,r,i;for(r=0,i=n.zoomIn.length;r<i;r++)t[n.zoomIn[r]]=e;for(r=0,i=n.zoomOut.length;r<i;r++)t[n.zoomOut[r]]=-e},_addHooks:function(){K(document,`keydown`,this._onKeyDown,this)},_removeHooks:function(){q(document,`keydown`,this._onKeyDown,this)},_onKeyDown:function(e){if(!(e.altKey||e.ctrlKey||e.metaKey)){var t=e.keyCode,n=this._map,r;if(t in this._panKeys){if(!n._panAnim||!n._panAnim._inProgress)if(r=this._panKeys[t],e.shiftKey&&(r=D(r).multiplyBy(3)),n.options.maxBounds&&(r=n._limitOffset(D(r),n.options.maxBounds)),n.options.worldCopyJump){var i=n.wrapLatLng(n.unproject(n.project(n.getCenter()).add(r)));n.panTo(i)}else n.panBy(r)}else if(t in this._zoomKeys)n.setZoom(n.getZoom()+(e.shiftKey?3:1)*this._zoomKeys[t]);else if(t===27&&n._popup&&n._popup.options.closeOnEscapeKey)n.closePopup();else return;$t(e)}}});Y.addInitHook(`addHandler`,`keyboard`,ti),Y.mergeOptions({scrollWheelZoom:!0,wheelDebounceTime:40,wheelPxPerZoomLevel:60});var ni=Z.extend({addHooks:function(){K(this._map._container,`wheel`,this._onWheelScroll,this),this._delta=0},removeHooks:function(){q(this._map._container,`wheel`,this._onWheelScroll,this)},_onWheelScroll:function(e){var t=rn(e),n=this._map.options.wheelDebounceTime;this._delta+=t,this._lastMousePos=this._map.mouseEventToContainerPoint(e),this._startTime||=+new Date;var r=Math.max(n-(+new Date-this._startTime),0);clearTimeout(this._timer),this._timer=setTimeout(i(this._performZoom,this),r),$t(e)},_performZoom:function(){var e=this._map,t=e.getZoom(),n=this._map.options.zoomSnap||0;e._stop();var r=this._delta/(this._map.options.wheelPxPerZoomLevel*4),i=4*Math.log(2/(1+Math.exp(-Math.abs(r))))/Math.LN2,a=n?Math.ceil(i/n)*n:i,o=e._limitZoom(t+(this._delta>0?a:-a))-t;this._delta=0,this._startTime=null,o&&(e.options.scrollWheelZoom===`center`?e.setZoom(t+o):e.setZoomAround(this._lastMousePos,t+o))}});Y.addInitHook(`addHandler`,`scrollWheelZoom`,ni);var ri=600;Y.mergeOptions({tapHold:z.touchNative&&z.safari&&z.mobile,tapTolerance:15});var ii=Z.extend({addHooks:function(){K(this._map._container,`touchstart`,this._onDown,this)},removeHooks:function(){q(this._map._container,`touchstart`,this._onDown,this)},_onDown:function(e){if(clearTimeout(this._holdTimeout),e.touches.length===1){var t=e.touches[0];this._startPos=this._newPos=new E(t.clientX,t.clientY),this._holdTimeout=setTimeout(i(function(){this._cancel(),this._isTapValid()&&(K(document,`touchend`,J),K(document,`touchend touchcancel`,this._cancelClickPrevent),this._simulateEvent(`contextmenu`,t))},this),ri),K(document,`touchend touchcancel contextmenu`,this._cancel,this),K(document,`touchmove`,this._onMove,this)}},_cancelClickPrevent:function e(){q(document,`touchend`,J),q(document,`touchend touchcancel`,e)},_cancel:function(){clearTimeout(this._holdTimeout),q(document,`touchend touchcancel contextmenu`,this._cancel,this),q(document,`touchmove`,this._onMove,this)},_onMove:function(e){var t=e.touches[0];this._newPos=new E(t.clientX,t.clientY)},_isTapValid:function(){return this._newPos.distanceTo(this._startPos)<=this._map.options.tapTolerance},_simulateEvent:function(e,t){var n=new MouseEvent(e,{bubbles:!0,cancelable:!0,view:window,screenX:t.screenX,screenY:t.screenY,clientX:t.clientX,clientY:t.clientY});n._simulated=!0,t.target.dispatchEvent(n)}});Y.addInitHook(`addHandler`,`tapHold`,ii),Y.mergeOptions({touchZoom:z.touch,bounceAtZoomLimits:!0});var ai=Z.extend({addHooks:function(){H(this._map._container,`leaflet-touch-zoom`),K(this._map._container,`touchstart`,this._onTouchStart,this)},removeHooks:function(){U(this._map._container,`leaflet-touch-zoom`),q(this._map._container,`touchstart`,this._onTouchStart,this)},_onTouchStart:function(e){var t=this._map;if(!(!e.touches||e.touches.length!==2||t._animatingZoom||this._zooming)){var n=t.mouseEventToContainerPoint(e.touches[0]),r=t.mouseEventToContainerPoint(e.touches[1]);this._centerPoint=t.getSize()._divideBy(2),this._startLatLng=t.containerPointToLatLng(this._centerPoint),t.options.touchZoom!==`center`&&(this._pinchStartLatLng=t.containerPointToLatLng(n.add(r)._divideBy(2))),this._startDist=n.distanceTo(r),this._startZoom=t.getZoom(),this._moved=!1,this._zooming=!0,t._stop(),K(document,`touchmove`,this._onTouchMove,this),K(document,`touchend touchcancel`,this._onTouchEnd,this),J(e)}},_onTouchMove:function(e){if(!(!e.touches||e.touches.length!==2||!this._zooming)){var t=this._map,n=t.mouseEventToContainerPoint(e.touches[0]),r=t.mouseEventToContainerPoint(e.touches[1]),a=n.distanceTo(r)/this._startDist;if(this._zoom=t.getScaleZoom(a,this._startZoom),!t.options.bounceAtZoomLimits&&(this._zoom<t.getMinZoom()&&a<1||this._zoom>t.getMaxZoom()&&a>1)&&(this._zoom=t._limitZoom(this._zoom)),t.options.touchZoom===`center`){if(this._center=this._startLatLng,a===1)return}else{var o=n._add(r)._divideBy(2)._subtract(this._centerPoint);if(a===1&&o.x===0&&o.y===0)return;this._center=t.unproject(t.project(this._pinchStartLatLng,this._zoom).subtract(o),this._zoom)}this._moved||=(t._moveStart(!0,!1),!0),S(this._animRequest);var s=i(t._move,t,this._center,this._zoom,{pinch:!0,round:!1},void 0);this._animRequest=x(s,this,!0),J(e)}},_onTouchEnd:function(){if(!this._moved||!this._zooming){this._zooming=!1;return}this._zooming=!1,S(this._animRequest),q(document,`touchmove`,this._onTouchMove,this),q(document,`touchend touchcancel`,this._onTouchEnd,this),this._map.options.zoomAnimation?this._map._animateZoom(this._center,this._map._limitZoom(this._zoom),!0,this._map.options.zoomSnap):this._map._resetView(this._center,this._map._limitZoom(this._zoom))}});Y.addInitHook(`addHandler`,`touchZoom`,ai),Y.BoxZoom=Qr,Y.DoubleClickZoom=$r,Y.Drag=ei,Y.Keyboard=ti,Y.ScrollWheelZoom=ni,Y.TapHold=ii,Y.TouchZoom=ai,e.Bounds=O,e.Browser=z,e.CRS=se,e.Canvas=Ur,e.Circle=ar,e.CircleMarker=rr,e.Class=C,e.Control=ln,e.DivIcon=Pr,e.DivOverlay=kr,e.DomEvent=on,e.DomUtil=Wt,e.Draggable=yn,e.Evented=T,e.FeatureGroup=Jn,e.GeoJSON=dr,e.GridLayer=Ir,e.Handler=Z,e.Icon=Xn,e.ImageOverlay=Cr,e.LatLng=M,e.LatLngBounds=A,e.Layer=Gn,e.LayerGroup=Kn,e.LineUtil=Rn,e.Map=Y,e.Marker=er,e.Mixin=_n,e.Path=nr,e.Point=E,e.PolyUtil=Sn,e.Polygon=lr,e.Polyline=sr,e.Popup=Ar,e.PosAnimation=sn,e.Projection=Vn,e.Rectangle=Xr,e.Renderer=Hr,e.SVG=Jr,e.SVGOverlay=Dr,e.TileLayer=Rr,e.Tooltip=Mr,e.Transformation=ue,e.Util=ie,e.VideoOverlay=Tr,e.bind=i,e.bounds=k,e.canvas=Wr,e.circle=or,e.circleMarker=ir,e.control=un,e.divIcon=Fr,e.extend=n,e.featureGroup=Yn,e.geoJSON=xr,e.geoJson=Sr,e.gridLayer=Lr,e.icon=Zn,e.imageOverlay=wr,e.latLng=N,e.latLngBounds=j,e.layerGroup=qn,e.map=cn,e.marker=tr,e.point=D,e.polygon=ur,e.polyline=cr,e.popup=jr,e.rectangle=Zr,e.setOptions=p,e.stamp=o,e.svg=Yr,e.svgOverlay=Or,e.tileLayer=zr,e.tooltip=Nr,e.transformation=de,e.version=t,e.videoOverlay=Er;var oi=window.L;e.noConflict=function(){return window.L=oi,this},window.L=e}))})),p=l(f(),1),m={key:`de27deab99d785fc6d1cf5ea64200794`,securityJsCode:`4d0564f442a8150fd4209442f4e2fcde`,plugins:[`AMap.AutoComplete`,`AMap.PlaceSearch`,`AMap.Geolocation`,`AMap.Driving`,`AMap.Geocoder`]},h={center:[23.129112,113.264385],zoom:16},g=`/api/v1/tiles/relay`,_=new Set([`0`,`false`,`off`,`no`]);function ee(e,t=!0){return e==null||e===``?t:!_.has(String(e).trim().toLowerCase())}var te={enhancedGesturesEnabled:ee(void 0,!0)},v={enabled:!0,provider:`arcgis-terrain3d`,ionToken:``,selfHostedUrl:``,mapTilerUrl:``,exaggeration:1.35,quality:`auto`,demoView:{lng:86.925,lat:27.988,height:9e3,heading:28,pitch:-34}},y=Math.PI,ne=6378245,b=.006693421622965943;function re(e,t){return e<72.004||e>137.8347||t<.8293||t>55.8271}function x(e,t){let n=-100+2*e+3*t+.2*t*t+.1*e*t+.2*Math.sqrt(Math.abs(e));return n+=(20*Math.sin(6*e*y)+20*Math.sin(2*e*y))*2/3,n+=(20*Math.sin(t*y)+40*Math.sin(t/3*y))*2/3,n+=(160*Math.sin(t/12*y)+320*Math.sin(t*y/30))*2/3,n}function S(e,t){let n=300+e+2*t+.1*e*e+.1*e*t+.1*Math.sqrt(Math.abs(e));return n+=(20*Math.sin(6*e*y)+20*Math.sin(2*e*y))*2/3,n+=(20*Math.sin(e*y)+40*Math.sin(e/3*y))*2/3,n+=(150*Math.sin(e/12*y)+300*Math.sin(e/30*y))*2/3,n}function ie(e){let t=Number(e);if(!Number.isFinite(t))return e;let n=((t+180)%360+360)%360-180;return n===-180&&t>0?180:n}function C([e,t]){if(re(e,t))return[e,t];let n=x(e-105,t-35),r=S(e-105,t-35),i=t/180*y,a=Math.sin(i);a=1-b*a*a;let o=Math.sqrt(a);return n=n*180/(ne*(1-b)/(a*o)*y),r=r*180/(ne/o*Math.cos(i)*y),[e+r,t+n]}function ae([e,t]){if(re(e,t))return[e,t];let n=e-.02,r=e+.02,i=t-.02,a=t+.02,o=e,s=t;for(let c=0;c<30;c++){o=(n+r)/2,s=(i+a)/2;let[c,l]=C([o,s]),u=c-e,d=l-t;if(Math.abs(u)<1e-9&&Math.abs(d)<1e-9)return[o,s];u>0?r=o:n=o,d>0?a=s:i=s}return[o,s]}function w(e){return Array.isArray(e)?typeof e[0]==`number`&&typeof e[1]==`number`?C(e):e.map(w):e}var T={enableHighAccuracy:!0,timeout:12e3,maximumAge:0},E=T.timeout+1e3;function oe(e){return e?.Geolocation?new e.Geolocation({enableHighAccuracy:!0,noIpLocate:3,timeout:12e3,maximumAge:0,convert:!0,showButton:!1,showMarker:!1,showCircle:!1,panToLocation:!1,zoomToAccuracy:!1}):(console.warn(`高德定位插件加载失败，将仅使用浏览器定位`),null)}function D(e){if(e==null||e===``||typeof e==`boolean`)return null;let t=Number(e);return Number.isFinite(t)?t:null}function O(e){let t=D(e?.lat),n=D(e?.lng);return t!==null&&n!==null&&Math.abs(t)<=90&&Math.abs(n)<=180}function k(e){return e<0?e+360:e}function A(e){let t=Number(e.lat),n=Number(e.lng);if(e.coordType===`gcj02`)return{lat:t,lng:n,accuracy:e.accuracy,source:e.source,coordType:`gcj02`,locationType:e.locationType};let[r,i]=C([n,t]);return{lat:i,lng:r,accuracy:e.accuracy,source:e.source,coordType:`gcj02`,locationType:e.locationType}}function j(e){let t=A(e);return[t.lat,k(t.lng)]}function M(e,t,n,r){let i=Error(e);return t!=null&&(i.code=t),n&&(i.source=n),r!==void 0&&(i.cause=r),i}function N(e){if(e?.reason instanceof Error)return e.reason;let t=typeof DOMException==`function`?new DOMException(`定位请求已取消`,`AbortError`):M(`定位请求已取消`,`ABORT_ERR`);if(e?.reason!==void 0&&!(`cause`in t))try{t.cause=e.reason}catch{}return t}function se(e,t){return M(`${e===`amap`?`高德`:`浏览器`}定位等待超时（超过 ${t} 毫秒）`,`GEOLOCATION_TIMEOUT`,e)}function P(e,t){let n=D((t===`amap`?e?.amapDeadlineMs:e?.browserDeadlineMs)??e?.deadlineMs);return n!==null&&n>=0?n:E}function ce(e,t,n){let r=P(t,n),i=t?.signal,a=t?.setTimeoutFn||globalThis.setTimeout,o=t?.clearTimeoutFn||globalThis.clearTimeout;return new Promise((t,s)=>{let c=!1,l=null,u=()=>{l!==null&&(o(l),l=null),i?.removeEventListener?.(`abort`,f)},d=(e,t)=>{c||(c=!0,u(),e(t))},f=()=>{d(s,N(i))};if(i?.aborted){f();return}i?.addEventListener?.(`abort`,f,{once:!0}),l=a(()=>{d(s,se(n,r))},r);try{e(e=>d(t,e),e=>d(s,e),()=>!c)}catch(e){d(s,e)}})}function le(e){return D(typeof e==`function`?e():Date.now())??Date.now()}function ue(e){let t=D(e);return t!==null&&t>=0?t:null}function de(e,t=Date.now){let n=e?.coords,r={lat:D(n?.latitude),lng:D(n?.longitude),accuracy:ue(n?.accuracy),source:`browser`,coordType:`wgs84`,locationType:`html5`,timestamp:D(e?.timestamp)??le(t)};return O(r)?r:null}function fe(e){return Object.prototype.hasOwnProperty.call(e||{},`navigator`)?e.navigator:globalThis.navigator}function pe(e={}){let t=e.browserOptions||e.positionOptions||{},n={};for(let t of[`enableHighAccuracy`,`timeout`,`maximumAge`])e[t]!==void 0&&(n[t]=e[t]);return{...T,...t,...n}}function me(e={}){return ce((t,n,r)=>{let i=fe(e);if(typeof i?.geolocation?.getCurrentPosition!=`function`){n(M(`你的浏览器不支持当前地理位置信息获取`,`GEOLOCATION_UNSUPPORTED`,`browser`));return}i.geolocation.getCurrentPosition(i=>{if(r())try{let r=de(i,e.now);if(!r){n(M(`浏览器返回了无效的定位坐标`,`POSITION_INVALID`,`browser`));return}t(r)}catch(e){n(e)}},n,pe(e))},e,`browser`)}function he(e,t={}){return me(t)}function ge(e,t){if(typeof e==`function`){if(typeof queueMicrotask==`function`){queueMicrotask(()=>e(t));return}Promise.resolve().then(()=>e(t))}}function _e(e,t={}){let n=Object.prototype.hasOwnProperty.call(t,`navigator`)?t.navigator:globalThis.navigator,r=new Map,i=1,a=e=>{let t=r.get(e);if(t){r.delete(e),t.active=!1,t.signal?.removeEventListener?.(`abort`,t.handleAbort);try{t.nativeWatchId!==null&&t.nativeWatchId!==void 0&&n?.geolocation?.clearWatch?.(t.nativeWatchId)}catch(e){console.warn(`停止浏览器持续定位监听失败`,e)}}},o=(e,o,s={})=>{if(typeof e!=`function`)throw TypeError(`持续定位成功回调必须是函数`);let c=n?.geolocation;if(typeof c?.watchPosition!=`function`||s.signal?.aborted)return null;let l=i++,u={active:!0,nativeWatchId:null,signal:s.signal,handleAbort:null};r.set(l,u),u.handleAbort=()=>a(l),u.signal?.addEventListener?.(`abort`,u.handleAbort,{once:!0});try{u.nativeWatchId=c.watchPosition(n=>{if(!(!u.active||s.signal?.aborted))try{let r=de(n,s.now||t.now);if(!r){o?.(M(`浏览器持续定位返回了无效坐标`,`POSITION_INVALID`,`browser`));return}e(r)}catch(e){o?.(e)}},e=>{!u.active||s.signal?.aborted||o?.(e)},pe({...t.positionOptions||{},...s}))}catch(e){throw a(l),e}if(!u.active){try{c.clearWatch?.(u.nativeWatchId)}catch{}return null}return l},s=(r={})=>he(e,{...t.positionOptions||{},...r,navigator:n,now:r.now||t.now,setTimeoutFn:r.setTimeoutFn||t.setTimeoutFn,clearTimeoutFn:r.clearTimeoutFn||t.clearTimeoutFn}),c=e=>{if(typeof e!=`function`)throw TypeError(`定位权限监听器必须是函数`);let t=!0,r=null,i=null,a=null,o=(n,r)=>{t&&e(n,r)},s=()=>{t&&(t=!1,!(!r||!i)&&(typeof r.removeEventListener==`function`?r.removeEventListener(`change`,i):r.onchange===i&&(r.onchange=a)))},c=n?.permissions;return typeof c?.query==`function`?(Promise.resolve().then(()=>c.query({name:`geolocation`})).then(e=>{t&&(r=e,i=()=>o(r?.state||`unknown`),typeof r?.addEventListener==`function`?r.addEventListener(`change`,i):r&&(a=r.onchange,r.onchange=i),o(r?.state||`unknown`))}).catch(e=>o(`unknown`,e)),s):(ge(()=>o(`unknown`)),s)};return{watchPosition:o,clearWatch:a,pollPosition:s,subscribePermission:c,permissions:{subscribe:c}}}function ve(){let e=document.getElementById(`app-dialog-root`);return e||(e=document.createElement(`div`),e.id=`app-dialog-root`,document.body.appendChild(e)),e}function F(e){return String(e??``).replaceAll(`&`,`&amp;`).replaceAll(`<`,`&lt;`).replaceAll(`>`,`&gt;`).replaceAll(`"`,`&quot;`).replaceAll(`'`,`&#39;`)}function I(e,t,n,r){t(),e.innerHTML=``,e.hidden=!0,n(r)}function ye(e={}){let t=ve(),n=e.title||`提示`,r=e.message||``,i=e.confirmText||`确定`,a=e.cancelText||`取消`,o=!!e.showCancel,s=e.checkbox||null;t.hidden=!1,t.innerHTML=`
    <div class="app-dialog-backdrop" data-dialog-action="cancel">
      <section class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="app-dialog-title">
        <h2 id="app-dialog-title">${F(n)}</h2>
        <p>${F(r)}</p>
        ${s?`
          <label class="app-dialog-check">
            <input type="checkbox" data-dialog-checkbox ${s.checked?`checked`:``}>
            <span>${F(s.label||``)}</span>
          </label>
        `:``}
        <div class="app-dialog-actions">
          ${o?`<button type="button" class="app-dialog-secondary" data-dialog-action="cancel">${F(a)}</button>`:``}
          <button type="button" class="app-dialog-primary" data-dialog-action="confirm">${F(i)}</button>
        </div>
      </section>
    </div>
  `;let c=t.querySelector(`.app-dialog`);return t.querySelector(`.app-dialog-primary`)?.focus(),new Promise(e=>{let n=()=>{t.removeEventListener(`click`,i),document.removeEventListener(`keydown`,a)},r=r=>{let i=!!t.querySelector(`[data-dialog-checkbox]`)?.checked;I(t,n,e,s?{confirmed:r,checked:i}:r)},i=e=>{let t=e.target.closest(`[data-dialog-action]`);t&&(c?.contains(e.target)&&t.classList.contains(`app-dialog-backdrop`)||r(t.dataset.dialogAction===`confirm`))},a=e=>{e.key===`Escape`&&(e.preventDefault(),r(!1))};t.addEventListener(`click`,i),document.addEventListener(`keydown`,a)})}function be(e,t={}){return ye({title:t.title||`提示`,message:e,confirmText:t.confirmText||`知道了`})}function xe(e,t={}){return ye({title:t.title||`确认操作`,message:e,confirmText:t.confirmText||`确认`,cancelText:t.cancelText||`取消`,showCancel:!0})}function Se(e,t={}){return ye({title:t.title||`确认操作`,message:e,confirmText:t.confirmText||`确认`,cancelText:t.cancelText||`取消`,showCancel:!0,checkbox:{label:t.checkboxLabel||``,checked:!!t.checked}})}function Ce(e={}){let t=ve(),n=e.title||`编辑属性`,r=e.fields||[],i=e.values||{},a=e.confirmText||`保存`,o=e.cancelText||`取消`;t.hidden=!1,t.innerHTML=`
    <div class="app-dialog-backdrop" data-dialog-action="cancel">
      <form class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="app-dialog-title" data-dialog-form autocomplete="off">
        <h2 id="app-dialog-title">${F(n)}</h2>
        <div class="app-dialog-body" style="margin: 16px 0; text-align: left;">
          ${r.map(e=>{let t=F(i[e.name]||``);return e.type===`select`?`
                <label style="display: block; margin-bottom: 12px;">
                  <span style="display: block; font-size: 13px; margin-bottom: 4px; color: #4b5563; font-weight: 500;">${F(e.label)}</span>
                  <select name="${F(e.name)}" style="width: 100%; height: 36px; padding: 0 8px; border: 1px solid #d1d5db; border-radius: 6px; box-sizing: border-box; font-size: 13px; outline: none; background: #fff;">
                    ${(e.options||[]).map(t=>{let n=typeof t==`object`?t.value:t,r=typeof t==`object`?t.label:t,a=String(i[e.name]??``)===String(n)?`selected`:``;return`<option value="${F(n)}" ${a}>${F(r)}</option>`}).join(``)}
                  </select>
                </label>
              `:e.type===`textarea`?`
                <label style="display: block; margin-bottom: 12px;">
                  <span style="display: block; font-size: 13px; margin-bottom: 4px; color: #4b5563; font-weight: 500;">${F(e.label)}</span>
                  <textarea name="${F(e.name)}" rows="3" style="width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; box-sizing: border-box; font-family: inherit; font-size: 13px; resize: vertical; outline: none;"></textarea>
                </label>
                `:`
              <label style="display: block; margin-bottom: 12px;">
                <span style="display: block; font-size: 13px; margin-bottom: 4px; color: #4b5563; font-weight: 500;">${F(e.label)}</span>
                <input type="text" name="${F(e.name)}" value="${t}" style="width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; box-sizing: border-box; font-size: 13px; outline: none;" required>
              </label>
            `}).join(``)}
        </div>
        <div class="app-dialog-actions" style="display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 16px;">
          <div>
            ${e.showReset?`<button type="button" class="app-dialog-secondary" data-dialog-action="reset" style="border-color: rgba(220, 38, 38, 0.25); color: #dc2626;">重置</button>`:``}
          </div>
          <div style="display: flex; gap: 8px;">
            <button type="button" class="app-dialog-secondary" data-dialog-action="cancel">${F(o)}</button>
            <button type="submit" class="app-dialog-primary">${F(a)}</button>
          </div>
        </div>
      </form>
    </div>
  `;let s=t.querySelector(`[data-dialog-form]`);return r.forEach(e=>{if(e.type===`textarea`){let t=s.querySelector(`textarea[name="${e.name}"]`);t&&(t.value=i[e.name]||``)}}),t.querySelector(`.app-dialog-primary`)?.focus(),new Promise(n=>{let i=()=>{t.removeEventListener(`click`,o),s?.removeEventListener(`submit`,a),document.removeEventListener(`keydown`,c)},a=e=>{e.preventDefault();let r=new FormData(s),a={};for(let[e,t]of r.entries())a[e]=t;I(t,i,n,a)},o=a=>{let o=a.target.closest(`[data-dialog-action]`);if(!o||s?.contains(a.target)&&o.classList.contains(`app-dialog-backdrop`))return;let c=o.dataset.dialogAction;c===`cancel`?I(t,i,n,null):c===`reset`&&(a.preventDefault(),a.stopPropagation(),e.resetValues&&r.forEach(t=>{let n=s.querySelector(`[name="${t.name}"]`);n&&(n.value=String(e.resetValues[t.name]??``))}))},c=e=>{e.key===`Escape`&&(e.preventDefault(),I(t,i,n,null))};t.addEventListener(`click`,o),s?.addEventListener(`submit`,a),document.addEventListener(`keydown`,c)})}function we(e={}){let t=ve(),n=e.title||`提示`,r=e.message||``,i=e.choices||[],a=e.cancelText||`取消`;t.hidden=!1,t.innerHTML=`
    <div class="app-dialog-backdrop" data-dialog-action="cancel">
      <section class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="app-dialog-title">
        <h2 id="app-dialog-title">${F(n)}</h2>
        <p>${F(r)}</p>
        <div class="app-dialog-actions" style="flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 16px;">
          ${i.map(e=>`
            <button type="button" class="${e.class||`app-dialog-secondary`}" data-choice-action="${F(e.value)}">${F(e.text)}</button>
          `).join(``)}
          <button type="button" class="app-dialog-secondary" data-dialog-action="cancel">${F(a)}</button>
        </div>
      </section>
    </div>
  `;let o=t.querySelector(`.app-dialog`);return new Promise(e=>{let n=()=>{t.removeEventListener(`click`,r),document.removeEventListener(`keydown`,i)},r=r=>{let i=r.target.closest(`[data-choice-action]`);if(i){I(t,n,e,i.dataset.choiceAction);return}let a=r.target.closest(`[data-dialog-action]`);if(a&&a.dataset.dialogAction===`cancel`){if(o?.contains(r.target)&&a.classList.contains(`app-dialog-backdrop`))return;I(t,n,e,`cancel`)}},i=r=>{r.key===`Escape`&&(r.preventDefault(),I(t,n,e,`cancel`))};t.addEventListener(`click`,r),document.addEventListener(`keydown`,i)})}var Te=15e3,Ee=1e3,De=3e4,Oe=100,ke=45e3,Ae=500,je=5*6e4,Me=2,Ne=3,Pe=3e4,Fe=6371008.8,Ie=Object.freeze({idle:`已停止`,starting:`正在启动定位`,tracking:`持续定位中`,stale:`定位信号已中断`,recovering:`正在恢复定位`,suspended:`定位已暂停，等待页面恢复`,"permission-blocked":`定位权限已被禁止`,unsupported:`当前环境不支持持续定位`});function Le(e){if(e==null||e===``||typeof e==`boolean`)return null;let t=Number(e);return Number.isFinite(t)?t:null}function R(e,t){let n=Le(e);return n!==null&&n>=0?n:t}function Re(e,t,n){return Le(e?.[t]??e?.coords?.[n])}function ze(e){return Le(e?.timestamp??e?.providerTimestamp??e?.receivedAt)}function Be(e,t){let n=R(e?.accuracy??e?.coords?.accuracy,0);return Math.min(n,t)}function Ve(e){let t=Re(e,`lat`,`latitude`),n=Re(e,`lng`,`longitude`);return t!==null&&n!==null&&Math.abs(t)<=90&&Math.abs(n)<=180}function He(e,t){return!e||!t?!1:Re(e,`lat`,`latitude`)===Re(t,`lat`,`latitude`)&&Re(e,`lng`,`longitude`)===Re(t,`lng`,`longitude`)}function Ue(e,t){let n=Re(e,`lat`,`latitude`)*Math.PI/180,r=Re(t,`lat`,`latitude`)*Math.PI/180,i=r-n,a=(Re(t,`lng`,`longitude`)-Re(e,`lng`,`longitude`))*Math.PI/180,o=Math.sin(i/2),s=Math.sin(a/2),c=o*o+Math.cos(n)*Math.cos(r)*s*s;return 2*Fe*Math.asin(Math.min(1,Math.sqrt(c)))}function We(e,t,n){let r=ze(e),i=ze(t),a=R(n.defaultIntervalMs,Te),o=r!==null&&i!==null?Math.max(0,i-r):a,s=R(n.maxSpeedKmh,Ae)*1e3/3600,c=R(n.baseToleranceMeters,30),l=R(n.maxAccuracyMeters,5e3);return c+s*o/1e3+Be(e,l)+Be(t,l)}function Ge(e){return e&&typeof e==`object`?{...e}:e}function Ke(e={},t,n={}){let r=e?.lastAccepted??null,i=e?.suspect??null;if(!Ve(t))return{accepted:!1,reason:`invalid-sample`,distanceMeters:null,allowedDistanceMeters:null,reanchored:!1,suspect:i};let a=Le(t?.accuracy??t?.coords?.accuracy);if(a!==null&&a>50)return{accepted:!1,reason:`poor-accuracy`,distanceMeters:null,allowedDistanceMeters:null,reanchored:!1,suspect:i};if(!r||!Ve(r))return{accepted:!0,reason:`initial-sample`,distanceMeters:0,allowedDistanceMeters:null,reanchored:!1,suspect:null};let o=Ue(r,t),s=We(r,t,n),c=ze(r),l=ze(t),u=R(n.reanchorAfterMs,je);if(c!==null&&l!==null&&l-c>=u)return{accepted:!0,reason:`long-gap-reanchor`,distanceMeters:o,allowedDistanceMeters:s,reanchored:!0,suspect:null};if(o<=s)return{accepted:!0,reason:`within-dynamic-threshold`,distanceMeters:o,allowedDistanceMeters:s,reanchored:!1,suspect:null};if(i&&Ve(i)){let e=ze(i),r=Ue(i,t),a=e===null||l===null||l>e||l===e&&r>.5,c=Math.max(R(n.suspectRadiusMeters,150),We(i,t,n));if(a&&r<=c)return{accepted:!0,reason:`confirmed-reanchor`,distanceMeters:o,allowedDistanceMeters:s,reanchored:!0,suspect:null};if(!a)return{accepted:!1,reason:`duplicate-suspect`,distanceMeters:o,allowedDistanceMeters:s,reanchored:!1,suspect:i}}return{accepted:!1,reason:`suspect-jump`,distanceMeters:o,allowedDistanceMeters:s,reanchored:!1,suspect:Ge(t)}}function qe(e){return Ie[typeof e==`string`?e:e?.phase]||`定位状态未知`}function Je(e,t){let n=typeof t==`string`?t:t?.phase,r=qe(t);return e?(e.dataset&&(e.dataset.locationPhase=n||`unknown`,e.dataset.locationLabel=r),e.title=r,e.setAttribute?.(`aria-label`,r),r):r}function Ye(e){let t=typeof e==`string`?e:e?.state;return[`granted`,`prompt`,`denied`].includes(t)?t:`unknown`}function Xe(e,t){let n=Le(e?.code),r=String(e?.code??e?.name??``).toUpperCase(),i=`source-error`;return n===1||r===`GEOLOCATION_PERMISSION_DENIED`||r===`PERMISSION_DENIED`?i=`permission-denied`:n===2||r===`GEOLOCATION_UNAVAILABLE`||r===`POSITION_UNAVAILABLE`?i=`position-unavailable`:n===3||r===`GEOLOCATION_TIMEOUT`||r===`TIMEOUT`?i=`timeout`:(r===`GEOLOCATION_UNSUPPORTED`||r===`GEOLOCATION_WATCH_UNSUPPORTED`)&&(i=`unsupported`),{code:i,message:{"permission-denied":`定位权限已被禁止`,"position-unavailable":`暂时无法获取定位`,timeout:`获取定位超时`,unsupported:`当前环境不支持持续定位`,"source-error":`定位服务暂时异常`}[i],at:t}}function z(){if(typeof AbortController==`function`)return new AbortController;let e={aborted:!1};return{signal:e,abort(){e.aborted=!0}}}function Ze(e,t,n){let r=t||e?.[n];return typeof r==`function`?(...n)=>r.apply(t?void 0:e,n):null}function Qe(e={}){return{now:typeof e.now==`function`?()=>e.now():()=>Date.now(),setTimeout:typeof e.setTimeout==`function`?(t,n)=>e.setTimeout(t,n):(e,t)=>globalThis.setTimeout(e,t),clearTimeout:typeof e.clearTimeout==`function`?t=>e.clearTimeout(t):e=>globalThis.clearTimeout(e)}}function $e(e){return e?typeof e.isVisible==`function`?e.isVisible()!==!1:typeof e.visibilityState==`function`?e.visibilityState()!==`hidden`:typeof e.visibilityState==`string`?e.visibilityState!==`hidden`:!0:!0}function et(e,t,n){return typeof e?.addEventListener==`function`?(e.addEventListener(t,n),()=>e.removeEventListener?.(t,n)):typeof e?.on==`function`?(e.on(t,n),()=>e.off?.(t,n)):()=>{}}function tt(e={}){let t=e.source||null,n=Ze(t,e.watchPosition,`watchPosition`),r=Ze(t,e.clearWatch,`clearWatch`),i=Ze(t,e.pollPosition,`pollPosition`),a=Ze(t,e.subscribePermission,`subscribePermission`)||Ze(t,e.onPermissionChange,`onPermissionChange`),o=Ze(t,e.getPermissionState,`getPermissionState`),s=e.lifecycle||null,c=Qe(e.clock),l=typeof e.onPosition==`function`?e.onPosition:()=>{},u=typeof e.onStateChange==`function`?e.onStateChange:()=>{},d={intervalMs:R(e.intervalMs,Te),pollIntervalMs:R(e.pollIntervalMs,R(e.intervalMs,Te)),staleTimeoutMs:R(e.staleTimeoutMs,Math.max(ke,R(e.intervalMs,Te)*4)),retryBaseMs:R(e.retryBaseMs,Ee),retryMaxMs:R(e.retryMaxMs,De),lifecycleDebounceMs:R(e.lifecycleDebounceMs,Oe),watchFailuresBeforePoll:Math.max(1,Math.floor(R(e.watchFailuresBeforePoll,Me))),timestampNonProgressLimit:Math.max(1,Math.floor(R(e.timestampNonProgressLimit,Ne))),consumerTimeoutMs:R(e.consumerTimeoutMs,Math.max(Pe,R(e.intervalMs,Te)*2)),positionOptions:e.positionOptions},f=e.staleTimeoutMs===void 0,p=e.pollIntervalMs===void 0,m=e.consumerTimeoutMs===void 0,h={desiredActive:!1,phase:`idle`,generation:0,watchId:null,activeSource:null,lastSignalAt:null,lastFixAt:null,lastProviderTimestamp:null,consecutiveTimestampAnomalies:0,consecutiveFailures:0,restartCount:0,lastError:null,permissionState:Ye(e.permissionState??t?.permissionState)},g=!1,_=!1,ee=null,te=null,v=null,y=null,ne=null,b=null,re=null,x=!1,S=0,ie=null,C=[],ae=null,w=0,T=null,E=0,oe=0,D=null;function O(){return{...h,lastError:h.lastError?{...h.lastError}:null,intervalMs:d.intervalMs,staleTimeoutMs:d.staleTimeoutMs,consumerTimeoutMs:d.consumerTimeoutMs}}function k(){try{u(O())}catch{}}function A(e){let t=e===`watchdog`?ee:e===`recovery`?te:e===`poll`?v:y;t!==null&&(c.clearTimeout(t),e===`watchdog`?ee=null:e===`recovery`?te=null:e===`poll`?v=null:y=null)}function j(){let e=h.watchId;if(h.watchId=null,!(e===null||!r))try{r(e)}catch{}}function M(){b?.abort(),b=null,re=null,A(`consume`),ne!==null&&(c.clearTimeout(ne),ne=null),S+=1,x=!1,ie=null}function N(){j(),A(`watchdog`),A(`poll`),h.activeSource=null,T=null,M()}function se(){return h.generation+=1,h.lastProviderTimestamp=null,h.consecutiveTimestampAnomalies=0,oe=0,D=null,N(),h.generation}function P(e){return h.desiredActive&&!g&&e===h.generation}function ce(e){T!==null&&e<T&&(T=e),h.lastSignalAt!==null&&e<h.lastSignalAt&&(h.lastSignalAt=e),ie!==null&&e<ie&&(ie=null)}function le(e){if(A(`watchdog`),!P(e)||h.phase===`suspended`||h.phase===`permission-blocked`)return;let t=c.now();ce(t);let n=h.lastSignalAt!==null&&h.lastSignalAt>=T?h.lastSignalAt:T,r=n===null?0:Math.max(0,t-n),a=Math.max(0,d.staleTimeoutMs-r);ee=c.setTimeout(()=>{if(ee=null,!P(e))return;ce(c.now());let t=h.lastSignalAt!==null&&h.lastSignalAt>=T?h.lastSignalAt:T;if((t===null?d.staleTimeoutMs:Math.max(0,c.now()-t))<d.staleTimeoutMs){le(e);return}h.phase=`stale`,h.lastError={code:`provider-stale`,message:`长时间未收到定位信号`,at:c.now()},k(),h.activeSource===`watch`&&(E+=1,E>=d.watchFailuresBeforePoll&&i&&(_=!0)),I(0)},a)}function ue(){let e=Math.max(0,h.consecutiveFailures-1);return Math.min(d.retryMaxMs,d.retryBaseMs*2**Math.min(e,20))}function de(){h.lastError={code:`consumer-error`,message:`地图位置更新失败，定位将继续`,at:c.now()},k()}function fe(e){if(!P(e)||x||!re)return;let t=c.now();ce(t);let n=ie===null?0:Math.max(0,d.intervalMs-(t-ie));if(n>0){y===null&&(y=c.setTimeout(()=>{y=null,fe(e)},n));return}let r=re;re=null,x=!0,ie=t;let i=++S,a=b?.signal,o=Promise.resolve().then(()=>l(r.position,{generation:e,signal:a,providerTimestamp:r.providerTimestamp}));(d.consumerTimeoutMs>0?Promise.race([o,new Promise((e,t)=>{ne=c.setTimeout(()=>{ne=null;let e=Error(`地图位置更新等待超时`);e.code=`consumer-timeout`,t(e)},d.consumerTimeoutMs)})]):o).then(t=>{if(!(!P(e)||i!==S||a?.aborted)){if(t===!1){de();return}h.lastFixAt=c.now(),h.lastError=null,k()}}).catch(t=>{P(e)&&i===S&&!a?.aborted&&(t?.code===`consumer-timeout`?(h.consecutiveFailures+=1,h.lastError={code:`consumer-timeout`,message:`地图位置更新超时，正在自动恢复定位`,at:c.now()},k(),I(0)):de())}).finally(()=>{i===S&&(ne!==null&&(c.clearTimeout(ne),ne=null),x=!1,P(e)&&fe(e))})}function pe(e,t){if(!P(t))return;if(!Ve(e)){he({code:`POSITION_INVALID`},t);return}let n=c.now();ce(n),h.lastSignalAt=n,le(t);let r=ze(e),a=r===null?n:r,o=h.lastProviderTimestamp!==null&&a<h.lastProviderTimestamp,s=h.lastProviderTimestamp!==null&&a===h.lastProviderTimestamp&&He(e,D);if(o||s){if(h.consecutiveTimestampAnomalies+=1,h.consecutiveTimestampAnomalies>=d.timestampNonProgressLimit){h.activeSource===`watch`&&(E+=1,E>=d.watchFailuresBeforePoll&&i&&(_=!0)),h.consecutiveFailures+=1,h.lastError={code:`provider-timestamp-not-progressing`,message:`定位数据持续未推进，正在自动重建定位源`,at:n},I(0);return}k();return}h.consecutiveTimestampAnomalies=0,h.lastProviderTimestamp=h.lastProviderTimestamp===null?a:Math.max(h.lastProviderTimestamp,a),D=e,oe+=1,h.activeSource===`watch`&&oe>=2&&(E=0),h.consecutiveFailures=0,h.permissionState=`granted`,h.phase=`tracking`,re={position:e,providerTimestamp:a},k(),fe(t)}function me(e){h.permissionState=`denied`,h.consecutiveFailures+=1,h.lastError=e,se(),A(`recovery`),h.phase=`permission-blocked`,k()}function he(e,t){if(!P(t))return;h.lastSignalAt=c.now();let n=Xe(e,c.now());if(n.code===`permission-denied`){me(n);return}if(n.code===`unsupported`){h.lastError=n,se(),A(`recovery`),h.phase=`unsupported`,k();return}h.activeSource===`watch`&&(E+=1,E>=d.watchFailuresBeforePoll&&i&&(_=!0)),h.consecutiveFailures+=1,h.lastError=n,k(),I(ue())}function ge(e){A(`poll`),!(!P(e)||h.activeSource!==`poll`)&&(v=c.setTimeout(()=>{v=null,_e(e)},d.pollIntervalMs))}function _e(e){if(!P(e)||h.activeSource!==`poll`||!i)return;let t;try{t=i({generation:e,signal:b?.signal,now:c.now,setTimeoutFn:c.setTimeout,clearTimeoutFn:c.clearTimeout})}catch(t){he(t,e);return}Promise.resolve(t).then(t=>{P(e)&&pe(t,e)}).catch(t=>{P(e)&&he(t,e)}).finally(()=>{P(e)&&h.activeSource===`poll`&&ge(e)})}function ve(e){return!i||!P(e)?!1:(_=!0,h.watchId=null,h.activeSource=`poll`,le(e),k(),_e(e),!0)}function F(e,t){if(P(e)&&(A(`recovery`),b=z(),h.phase=t?`recovering`:`starting`,T=c.now(),h.activeSource=null,t&&(h.restartCount+=1),k(),P(e))){if(n&&!_){let t;try{t=n(t=>{h.activeSource!==`poll`&&pe(t,e)},t=>{h.activeSource!==`poll`&&he(t,e)},{...d.positionOptions||{},signal:b.signal,now:c.now})}catch(t){if(ve(e))return;he(t,e);return}if(!P(e)){if(t!=null&&r)try{r(t)}catch{}return}if(t==null){if(ve(e))return;he({code:`GEOLOCATION_WATCH_UNSUPPORTED`},e);return}h.watchId=t,h.activeSource=`watch`,le(e),k();return}ve(e)||(h.phase=`unsupported`,h.lastError={code:`unsupported`,message:`当前环境不支持持续定位`,at:c.now()},k())}}function I(e){if(!h.desiredActive||g)return;A(`recovery`);let t=se();if(h.phase=`recovering`,k(),e<=0){F(t,!0);return}te=c.setTimeout(()=>{te=null,F(t,!0)},e)}function ye(){!h.desiredActive||h.phase===`suspended`||(A(`recovery`),se(),h.phase=`suspended`,k())}function be(){if(!h.desiredActive||g||!$e(s))return;if(h.phase===`permission-blocked`){Ce(!0);return}let e=c.now();ce(e);let t=h.lastSignalAt===null?1/0:e-h.lastSignalAt;(h.phase===`suspended`||!h.activeSource||t>=d.staleTimeoutMs)&&I(0)}function xe(){if(!h.desiredActive||g||!$e(s)||te!==null)return;let e=h.generation;te=c.setTimeout(()=>{te=null,P(e)&&be()},d.lifecycleDebounceMs)}function Se(e,t=!1){if(!h.desiredActive||g)return;let n=Ye(e);if(h.permissionState=n,n===`denied`){me({code:`permission-denied`,message:`定位权限已被禁止`,at:c.now()});return}k(),(h.phase===`permission-blocked`||!h.activeSource&&h.phase!==`suspended`||t&&n===`unknown`&&h.phase===`permission-blocked`)&&I(0)}function Ce(e=!1){if(!o){e&&h.phase===`permission-blocked`&&(h.permissionState=`unknown`,I(0));return}let t=++w,n;try{n=o()}catch{e&&h.phase===`permission-blocked`&&I(0);return}Promise.resolve(n).then(n=>{t!==w||!h.desiredActive||g||Se(n,e)}).catch(()=>{t===w&&e&&h.phase===`permission-blocked`&&I(0)})}function we(){if(C.length===0&&s&&(C=[et(s,`pagehide`,ye),et(s,`freeze`,ye),et(s,`visibilitychange`,xe),et(s,`pageshow`,xe),et(s,`resume`,xe),et(s,`focus`,xe),et(s,`online`,xe)]),!ae&&a)try{let e=a(e=>Se(e));ae=typeof e==`function`?e:()=>{}}catch{ae=()=>{}}}function Ae(){for(let e of C.splice(0))try{e()}catch{}if(ae){try{ae()}catch{}ae=null}w+=1}function je(){return g||h.desiredActive?O():(h.desiredActive=!0,_=!1,h.lastSignalAt=null,h.lastFixAt=null,h.lastProviderTimestamp=null,h.consecutiveTimestampAnomalies=0,h.consecutiveFailures=0,h.restartCount=0,E=0,oe=0,D=null,h.lastError=null,we(),h.permissionState===`denied`?(h.generation+=1,h.phase=`permission-blocked`,k(),Ce(),O()):(h.generation+=1,F(h.generation,!1),Ce(),O()))}function Fe(){return!h.desiredActive&&h.phase===`idle`?O():(h.desiredActive=!1,h.generation+=1,A(`recovery`),N(),Ae(),h.phase=`idle`,h.watchId=null,h.activeSource=null,h.lastProviderTimestamp=null,h.consecutiveTimestampAnomalies=0,oe=0,D=null,h.consecutiveFailures=0,h.lastError=null,k(),O())}function Ie(e={}){let t=d.intervalMs;return e.intervalSeconds!==void 0&&e.intervalMs===void 0&&(e={...e,intervalMs:Number(e.intervalSeconds)*1e3}),e.intervalMs!==void 0&&(d.intervalMs=R(e.intervalMs,d.intervalMs)),e.pollIntervalMs===void 0?p&&d.intervalMs!==t&&(d.pollIntervalMs=d.intervalMs):(d.pollIntervalMs=R(e.pollIntervalMs,d.pollIntervalMs),p=!1),e.staleTimeoutMs===void 0?f&&d.intervalMs!==t&&(d.staleTimeoutMs=Math.max(ke,d.intervalMs*4)):(d.staleTimeoutMs=R(e.staleTimeoutMs,d.staleTimeoutMs),f=!1),e.retryBaseMs!==void 0&&(d.retryBaseMs=R(e.retryBaseMs,d.retryBaseMs)),e.retryMaxMs!==void 0&&(d.retryMaxMs=R(e.retryMaxMs,d.retryMaxMs)),e.lifecycleDebounceMs!==void 0&&(d.lifecycleDebounceMs=R(e.lifecycleDebounceMs,d.lifecycleDebounceMs)),e.timestampNonProgressLimit!==void 0&&(d.timestampNonProgressLimit=Math.max(1,Math.floor(R(e.timestampNonProgressLimit,d.timestampNonProgressLimit)))),e.consumerTimeoutMs===void 0?m&&d.intervalMs!==t&&(d.consumerTimeoutMs=Math.max(Pe,d.intervalMs*2)):(d.consumerTimeoutMs=R(e.consumerTimeoutMs,d.consumerTimeoutMs),m=!1),e.positionOptions!==void 0&&(d.positionOptions=e.positionOptions),h.desiredActive&&(h.activeSource===`poll`&&v!==null&&ge(h.generation),h.activeSource&&le(h.generation),re&&(A(`consume`),fe(h.generation))),k(),O()}function Le(){return!h.desiredActive||g||be(),O()}function Re(){Fe(),g=!0}return{start:je,stop:Fe,configure:Ie,checkHealth:Le,destroy:Re,getState:O}}var nt=new Set([`visibilitychange`,`freeze`,`resume`]);function rt({windowRef:e=globalThis.window,documentRef:t=globalThis.document}={}){function n(n){return nt.has(n)?t:e}return{isVisible(){return t?.visibilityState!==`hidden`},addEventListener(e,t){let r=n(e);typeof r?.addEventListener==`function`&&r.addEventListener(e,t)},removeEventListener(e,t){n(e)?.removeEventListener?.(e,t)}}}var it=2e3,at=1e5;function ot(e){if(e==null||e===``||typeof e==`boolean`)return null;let t=Number(e);return Number.isFinite(t)?t:null}function st(e,{min:t,max:n}){if(typeof e==`string`&&!/^-?\d+$/.test(e.trim()))return null;let r=Number(e);return Number.isInteger(r)&&r>=t&&r<=n?r:null}function ct(e,t,n=()=>globalThis.localStorage){try{return n()?.getItem?.(e)??t}catch{return t}}function lt(e,t,{min:n=-(2**53-1),max:r=2**53-1}={},i=()=>globalThis.localStorage){let a=Number(ct(e,String(t),i));return Number.isInteger(a)&&a>=n&&a<=r?a:t}function ut(e){let t=ot(e);return t===null?0:Math.max(0,Math.floor(t))}function dt(e,t){if(!Array.isArray(e))return!1;let n=ut(t);return n===0||e.length<=n?!1:(e.splice(0,e.length-n),!0)}function ft(e){return Array.isArray(e)?[...e]:e&&typeof e==`object`?{...e}:e}function pt(e){return!e||typeof e!=`object`?null:{...e,latlng:ft(e.latlng),locationSample:e.locationSample&&typeof e.locationSample==`object`?{...e.locationSample}:e.locationSample}}function mt(){return{active:!1,segments:[],historyPoints:[],lastPosition:null}}function ht(e,{active:t=!1,currentPosition:n=null,maxHistoryPoints:r=0,preserveSegments:i=!1}={}){return!e||typeof e!=`object`?e:(e.active=!!t,i||(e.segments=[]),e.historyPoints=[],e.lastPosition=e.active?gt(n):null,xt(e,r),e)}function gt(e){let t=pt(e);return t?(t.firstTimestamp=t.timestamp,t.staySeconds=0,t):null}function _t(e,{maxHistoryPoints:t=0}={}){return!e||typeof e!=`object`?e:(e.active&&(e.historyPoints.length>0||e.lastPosition)&&e.segments.push({historyPoints:e.historyPoints,lastPosition:e.lastPosition}),e.active=!1,e.historyPoints=[],e.lastPosition=null,xt(e,t),e)}function vt(e,{currentPosition:t=null,maxHistoryPoints:n=0}={}){return!e||typeof e!=`object`?e:(e.active=!0,e.historyPoints=[],e.lastPosition=gt(t),xt(e,n),e)}function yt(e,t,{replaceLast:n=!1,maxHistoryPoints:r=0}={}){if(!e?.active||!t)return!1;let i=pt(t);if(!i)return!1;if(n&&e.lastPosition){let t=e.lastPosition.firstTimestamp;Number.isFinite(t)&&(i.firstTimestamp=t,i.staySeconds=Number.isFinite(i.timestamp)?Math.max(0,(i.timestamp-t)/1e3):e.lastPosition.staySeconds),e.lastPosition=i}else e.lastPosition&&e.historyPoints.push(e.lastPosition),e.lastPosition=i;return xt(e,r),!0}function bt(e){return(Array.isArray(e?.historyPoints)?e.historyPoints.length:0)+ +!!e?.lastPosition}function xt(e,t){if(!e||typeof e!=`object`)return!1;let n=ut(t);if(n===0)return!1;let r=Array.isArray(e.segments)?e.segments:e.segments=[],i=Array.isArray(e.historyPoints)?e.historyPoints:e.historyPoints=[],a=n+1,o=r.reduce((e,t)=>e+bt(t),0)+i.length+ +!!e.lastPosition,s=o-a;if(s<=0)return!1;for(;s>0&&r.length>0;){let e=r[0],t=Array.isArray(e?.historyPoints)?e.historyPoints:[],n=Math.min(s,t.length);n>0&&(t.splice(0,n),s-=n),s>0&&e?.lastPosition&&(e.lastPosition=null,--s),bt(e)===0&&r.shift()}if(s>0&&i.length>0){let e=Math.min(s,i.length);i.splice(0,e),s-=e}return o=r.reduce((e,t)=>e+bt(t),0)+i.length+ +!!e.lastPosition,o<=a}function B(e){if(!e)return{segments:[],historyPoints:[],lastPosition:null};let t=Array.isArray(e.segments)?[...e.segments]:[];return e.active?{segments:t,historyPoints:Array.isArray(e.historyPoints)?e.historyPoints:[],lastPosition:e.lastPosition||null}:{segments:t,historyPoints:[],lastPosition:null}}function V(e){return!e||typeof e!=`object`?!1:Array.isArray(e.segments)&&e.segments.some(e=>bt(e)>0)?!0:e.active?Array.isArray(e.historyPoints)&&e.historyPoints.length>0||!!e.lastPosition:!1}function St(e,t,n=[]){let r=[];for(let e of Array.isArray(n)?n:[]){let t=[...e?.historyPoints||[]];e?.lastPosition&&t.push(e.lastPosition),t.length>0&&r.push(t)}let i=[...e||[]];return t&&i.push(t),i.length>0&&r.push(i),r}function Ct(e){let t=Array.isArray(e?.features)?e.features:[];if(!e?.isLiveTrack)return t;let n=ot(e.renderPointLimit),r=n===null?120:Math.max(0,Math.floor(n)),i=Array(t.length).fill(!1),a=t.filter(e=>e?.type===`LineString`).length,o=ot(e.renderLinePointLimit),s=Math.max(2,Math.floor((o===null?it:Math.max(2,Math.floor(o)))/Math.max(1,a)));for(let e=t.length-1;e>=0;--e){if(t[e]?.type!==`Point`){i[e]=!0;continue}r>0&&(i[e]=!0,--r)}return t.flatMap((e,t)=>{if(e?.type===`Point`&&!i[t])return[];if(e?.type!==`LineString`||!Array.isArray(e.coordinates)||e.coordinates.length<=s)return[e];let n=[e.coordinates[0]];for(let t=1;t<s-1;t+=1){let r=Math.floor(t*(e.coordinates.length-1)/(s-1));n.push(e.coordinates[r])}return n.push(e.coordinates[e.coordinates.length-1]),[{...e,coordinates:n}]})}function wt(e={}){let t=e.value||`default`,n=e.options||[],r=e.attrs||``,i=n.find(e=>e.value===t)||n[0]||{label:`请选择`,value:``},a=n.map(e=>`<div class="custom-select-option ${e.value===t?`selected`:``}" data-value="${e.value}">${e.label}</div>`).join(``);return`
    <div class="custom-select ${e.className||``}" data-value="${t}" ${r}>
      <div class="custom-select-trigger">
        <span>${i.label}</span>
        <svg class="custom-select-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>
      <div class="custom-select-options">
        ${a}
      </div>
    </div>
  `}function Tt(e={}){let t=e.value||`#0f766e`,n=e.attrs||``,r=t.startsWith(`#`)?t.slice(1):t,i=[`#0f766e`,`#10b981`,`#3b82f6`,`#f97316`,`#ef4444`,`#8b5cf6`,`#ec4899`,`#22c55e`,`#f59e0b`,`#64748b`].map(e=>`<div class="custom-color-swatch" style="background-color: ${e};" data-color="${e}" title="${e}"></div>`).join(``);return`
    <div class="custom-color-picker ${e.className||``}" data-color="${t}" ${n}>
      <div class="custom-color-trigger" style="background-color: ${t};" title="选择颜色"></div>
      <div class="custom-color-dropdown">
        <div class="custom-color-palette">
          ${i}
        </div>
        <div class="custom-color-hex-row">
          <span class="custom-color-hex-hash">#</span>
          <input type="text" class="custom-color-hex-input" placeholder="0f766e" maxlength="6" value="${r}">
          <button type="button" class="custom-color-hex-btn">应用</button>
        </div>
        <div class="custom-color-custom-btn">更多色彩...</div>
        <input type="color" class="custom-color-hidden-input" value="${t}" style="display: none;">
      </div>
    </div>
  `}function H(){if(typeof window>`u`||window.__customControlsInitialized)return;window.__customControlsInitialized=!0;let e=()=>{document.body.querySelectorAll(`.custom-select-options.is-open`).forEach(e=>{e.classList.remove(`is-open`);let t=e.__parentControl;t&&(t.classList.remove(`is-open`),t.appendChild(e)),e.style.position=``,e.style.zIndex=``,e.style.width=``,e.style.top=``,e.style.left=``,e.style.margin=``}),document.body.querySelectorAll(`.custom-color-dropdown.is-open`).forEach(e=>{e.classList.remove(`is-open`);let t=e.__parentControl;t&&(t.classList.remove(`is-open`),t.appendChild(e)),e.style.position=``,e.style.zIndex=``,e.style.top=``,e.style.left=``,e.style.margin=``}),document.querySelectorAll(`.custom-select.is-open`).forEach(e=>e.classList.remove(`is-open`)),document.querySelectorAll(`.custom-color-picker.is-open`).forEach(e=>e.classList.remove(`is-open`))},t=e=>{Object.prototype.hasOwnProperty.call(e,`value`)||Object.defineProperty(e,"value",{get(){return this.getAttribute(`data-value`)},set(e){this.setAttribute(`data-value`,e);let t=this.querySelector(`.custom-select-trigger span`),n=this.querySelector(`.custom-select-options`)||document.body.querySelector(`.custom-select-options[data-kml-id="${this.getAttribute(`data-kml-id`)}"]`);n&&n.querySelectorAll(`.custom-select-option`).forEach(n=>{let r=n.getAttribute(`data-value`)===e;n.classList.toggle(`selected`,r),r&&t&&(t.textContent=n.textContent)})},configurable:!0})},n=e=>{Object.prototype.hasOwnProperty.call(e,`value`)||Object.defineProperty(e,"value",{get(){return this.getAttribute(`data-color`)},set(e){this.setAttribute(`data-color`,e);let t=this.querySelector(`.custom-color-trigger`);t&&(t.style.backgroundColor=e);let n=this.querySelector(`.custom-color-hidden-input`)||document.body.querySelector(`.custom-color-dropdown[data-kml-id="${this.getAttribute(`data-kml-id`)}"] .custom-color-hidden-input`);n&&(n.value=e);let r=this.querySelector(`.custom-color-hex-input`)||document.body.querySelector(`.custom-color-dropdown[data-kml-id="${this.getAttribute(`data-kml-id`)}"] .custom-color-hex-input`);r&&(r.value=e.startsWith(`#`)?e.slice(1):e)},configurable:!0})};document.addEventListener(`click`,t=>{t.target.closest(`.custom-select-trigger, .custom-color-trigger, .custom-color-dropdown`)||e()},!0),document.addEventListener(`scroll`,()=>e(),{capture:!0,passive:!0}),document.addEventListener(`click`,r=>{let i=r.target,a=i.closest(`.custom-select-trigger`);if(a){r.stopPropagation(),r.preventDefault();let t=a.closest(`.custom-select`);if(t){let n=t.classList.contains(`is-open`);if(e(),!n){t.classList.add(`is-open`);let e=t.querySelector(`.custom-select-options`);if(e){e.__parentControl=t;let n=a.getBoundingClientRect();e.style.position=`fixed`,e.style.zIndex=`99999`,e.style.margin=`0`,e.style.width=`${n.width}px`,e.style.top=`${n.bottom+4}px`,e.style.left=`${n.left}px`,document.body.appendChild(e),e.getBoundingClientRect(),e.classList.add(`is-open`)}}}return}let o=i.closest(`.custom-select-option`);if(o){r.stopPropagation(),r.preventDefault();let n=o.closest(`.custom-select-options`)?.__parentControl||o.closest(`.custom-select`);if(n){t(n);let r=o.getAttribute(`data-value`);r!==n.value&&(n.value=r,n.dispatchEvent(new Event(`change`,{bubbles:!0}))),e()}return}let s=i.closest(`.custom-color-trigger`);if(s){r.stopPropagation(),r.preventDefault();let t=s.closest(`.custom-color-picker`);if(t){let n=t.classList.contains(`is-open`);if(e(),!n){t.classList.add(`is-open`);let e=t.querySelector(`.custom-color-dropdown`);if(e){e.__parentControl=t;let n=s.getBoundingClientRect();e.style.position=`fixed`,e.style.zIndex=`99999`,e.style.margin=`0`,e.style.top=`${n.bottom+4}px`;let r=n.right-120;e.style.left=`${r<0?n.left:r}px`,document.body.appendChild(e),e.getBoundingClientRect(),e.classList.add(`is-open`)}}}return}let c=i.closest(`.custom-color-swatch`);if(c){r.stopPropagation(),r.preventDefault();let t=c.closest(`.custom-color-dropdown`)?.__parentControl||c.closest(`.custom-color-picker`);if(t){n(t);let r=c.getAttribute(`data-color`);r!==t.value&&(t.value=r,t.dispatchEvent(new Event(`change`,{bubbles:!0}))),e()}return}let l=i.closest(`.custom-color-hex-btn`);if(l){r.stopPropagation(),r.preventDefault();let t=l.closest(`.custom-color-dropdown`),i=t?.__parentControl||l.closest(`.custom-color-picker`);if(i){let r=t.querySelector(`.custom-color-hex-input`);if(r){let t=r.value.trim();t.startsWith(`#`)||(t=`#`+t),/^#[0-9A-Fa-f]{6}$/.test(t)?(n(i),i.value=t,i.dispatchEvent(new Event(`change`,{bubbles:!0})),e()):r.value=i.value.replace(`#`,``)}}return}let u=i.closest(`.custom-color-custom-btn`);if(u){r.stopPropagation(),r.preventDefault();let e=u.closest(`.custom-color-dropdown`);if(e?.__parentControl||u.closest(`.custom-color-picker`)){let t=e.querySelector(`.custom-color-hidden-input`);t&&t.click()}return}},!0),document.addEventListener(`keydown`,e=>{if(e.key===`Enter`){let t=e.target.closest(`.custom-color-hex-input`);if(t){e.stopPropagation(),e.preventDefault();let n=t.closest(`.custom-color-dropdown`);n&&n.querySelector(`.custom-color-hex-btn`)?.click()}}},!0),document.addEventListener(`input`,e=>{let t=e.target;if(t.matches(`.custom-color-hidden-input`)){let e=t.closest(`.custom-color-dropdown`)?.__parentControl||t.closest(`.custom-color-picker`);e&&(n(e),e.value=t.value,e.dispatchEvent(new Event(`change`,{bubbles:!0})))}})}function U(e){let t=new DOMParser().parseFromString(e,`text/xml`);if(t.querySelector(`parsererror`))throw Error(`KML 文件解析失败，可能格式不正确`);let n=t.getElementsByTagName(`Placemark`),r=[];for(let e=0;e<n.length;e++){let t=n[e],i=t.getElementsByTagName(`name`)[0],a=t.getElementsByTagName(`description`)[0],o=i?i.textContent.trim():`未命名要素 ${e+1}`,s=a?a.textContent.trim():``,c=null,l=null,u=t.getElementsByTagName(`Point`)[0],d=t.getElementsByTagName(`LineString`)[0],f=t.getElementsByTagName(`Polygon`)[0];u?(c=`Point`,l=Et(u.getElementsByTagName(`coordinates`)[0]?.textContent||``)[0]):d?(c=`LineString`,l=Et(d.getElementsByTagName(`coordinates`)[0]?.textContent||``)):f&&(c=`Polygon`,l=Et(f.getElementsByTagName(`outerBoundaryIs`)[0]?.getElementsByTagName(`coordinates`)[0]?.textContent||``)),c&&l&&r.push({id:`feat-${Date.now()}-${Math.random().toString(16).slice(2,8)}`,type:c,name:o,description:s,coordinates:l})}return r}function Et(e){return e.trim().split(/\s+/).map(e=>{let t=e.split(`,`).map(Number);return[t[0],t[1]]}).filter(e=>!isNaN(e[0])&&!isNaN(e[1]))}function Dt(e,t){let n=e=>String(e??``).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`).replace(/'/g,`&apos;`),r=[];r.push(`<?xml version="1.0" encoding="UTF-8"?>`),r.push(`<kml xmlns="http://www.opengis.net/kml/2.2">`),r.push(`  <Document>`),r.push(`    <name>${n(e)}</name>`);for(let e of t){if(r.push(`    <Placemark>`),r.push(`      <name>${n(e.name)}</name>`),r.push(`      <description>${n(e.description)}</description>`),e.type===`Point`)r.push(`      <Point>`),r.push(`        <coordinates>${e.coordinates[0]},${e.coordinates[1]},0</coordinates>`),r.push(`      </Point>`);else if(e.type===`LineString`){r.push(`      <LineString>`);let t=e.coordinates.map(e=>`${e[0]},${e[1]},0`).join(` `);r.push(`        <coordinates>${t}</coordinates>`),r.push(`      </LineString>`)}else if(e.type===`Polygon`){r.push(`      <Polygon>`),r.push(`        <outerBoundaryIs>`),r.push(`          <LinearRing>`);let t=[...e.coordinates],n=t[0],i=t[t.length-1];n&&i&&(n[0]!==i[0]||n[1]!==i[1])&&t.push(n);let a=t.map(e=>`${e[0]},${e[1]},0`).join(` `);r.push(`            <coordinates>${a}</coordinates>`),r.push(`          </LinearRing>`),r.push(`        </outerBoundaryIs>`),r.push(`      </Polygon>`)}r.push(`    </Placemark>`)}return r.push(`  </Document>`),r.push(`</kml>`),r.join(`
`)}var Ot=50,kt=[`image`,`video`,`iframe`,`link`],At={image:`图片`,video:`视频`,iframe:`页面`,link:`链接`},jt=new Set([`jpg`,`jpeg`,`png`,`webp`,`gif`,`avif`]),W=new Set([`mp4`,`webm`,`mov`,`m4v`,`m3u8`]),Mt=new Set([`token`,`access_token`,`key`,`api_key`,`apikey`,`secret`,`password`,`signature`,`sign`,`session`,`tk`,`appid`]),Nt=null;function G(e){return String(e??``).replaceAll(`&`,`&amp;`).replaceAll(`<`,`&lt;`).replaceAll(`>`,`&gt;`).replaceAll(`"`,`&quot;`).replaceAll(`'`,`&#39;`)}function Pt(e){let t=String(e||``).trim();for(;/^[<([{"'“‘]+/.test(t);)t=t.slice(1);for(;/[>),.;:!?，。；：！？、\]}"'”’]+$/.test(t);)t=t.slice(0,-1);return t.trim()}function Ft(e){try{return new URL(Pt(e))}catch{return null}}function It(e){let t=e.split(`.`).map(e=>Number(e));if(t.length!==4||t.some(e=>!Number.isInteger(e)||e<0||e>255))return!1;let[n,r]=t;return n===10||n===127||n===169&&r===254||n===172&&r>=16&&r<=31||n===192&&r===168||n===0}function Lt(e){let t=String(e||``).toLowerCase().replace(/^\[|\]$/g,``);return!t||t===`localhost`||t.endsWith(`.localhost`)||t.endsWith(`.local`)||t===`metadata.google.internal`||t===`169.254.169.254`||t===`::1`||t.startsWith(`fc`)||t.startsWith(`fd`)||t.startsWith(`fe80:`)||It(t)}function Rt(e){let t=new URL(e.toString());for(let e of[...t.searchParams.keys()])Mt.has(e.toLowerCase())&&t.searchParams.set(e,`****`);return t.toString()}function zt(e){let t=/\.([a-z0-9]+)$/i.exec(e.pathname);return t?t[1].toLowerCase():``}function Bt(){let e=window.MAP_SERVICE_KML_IFRAME_ALLOWLIST||window.mapServiceKmlIframeAllowlist||[];return Array.isArray(e)?e:String(e||``).split(`,`).map(e=>e.trim()).filter(Boolean)}function Vt(e){let t=e.hostname.toLowerCase(),n=`${e.origin}${e.pathname}`.toLowerCase();return Bt().some(e=>{let r=String(e||``).trim().toLowerCase();if(!r)return!1;if(r.startsWith(`https://`))return n.startsWith(r);if(r.startsWith(`*.`)){let e=r.slice(1);return t.endsWith(e)&&t!==e.slice(1)}return t===r})}function Ht(e,t=Ot){let n=String(e||``).match(/https?:\/\/[^\s<>"'`]+/gi)||[],r=new Set,i=[],a=!1;for(let e of n){let n=Ft(e);if(!n)continue;let o=n.toString();if(!r.has(o)){if(r.add(o),i.length>=t){a=!0;continue}i.push(n)}}return{urls:i,truncated:a}}function Ut(e,t){if(e.protocol!==`https:`||Lt(e.hostname))return null;let n=zt(e),r=`link`;jt.has(n)?r=`image`:W.has(n)?r=`video`:Vt(e)&&(r=`iframe`);let i=Rt(e);return{id:`description-link-${t+1}`,type:r,title:e.hostname,description:``,url:i,displayUrl:i,thumbnailUrl:r===`image`?i:``,sourceType:`description-link`,embedPolicy:r===`iframe`?{sandbox:`allow-scripts allow-forms allow-popups`,referrerPolicy:`no-referrer`}:null}}function Wt(){return kt.map(e=>({type:e,title:At[e],items:[]}))}function K(e){let t=Wt(),n=new Map(t.map(e=>[e.type,e])),{urls:r,truncated:i}=Ht(e?.description||``);r.forEach((e,t)=>{let r=Ut(e,t);r&&n.get(r.type)?.items.push(r)});let a={imageCount:n.get(`image`).items.length,videoCount:n.get(`video`).items.length,iframeCount:n.get(`iframe`).items.length,linkCount:n.get(`link`).items.length};return a.hasRichContent=a.imageCount>0||a.videoCount>0||a.iframeCount>0||a.linkCount>0,{featureId:String(e?.id||``),groups:t,contentSummary:a,sourceSummary:{bindings:0,libraries:0,descriptionLinks:r.length,rejected:0,truncated:i}}}function Gt(e){return q(K(e).contentSummary)}function q(e={}){let t=[];return e.imageCount&&t.push(`${e.imageCount} 张图片`),e.videoCount&&t.push(`${e.videoCount} 个视频`),e.iframeCount&&t.push(`${e.iframeCount} 个页面`),e.linkCount&&t.push(`${e.linkCount} 个链接`),t.join(` / `)}function Kt(){let e=document.getElementById(`kml-feature-content-panel`);return e||(e=document.createElement(`section`),e.id=`kml-feature-content-panel`,e.className=`kml-content-panel`,e.setAttribute(`role`,`dialog`),e.setAttribute(`aria-modal`,`false`),e.hidden=!0,document.body.appendChild(e)),e}function qt(){Nt?.abort(),Nt=null;let e=document.getElementById(`kml-feature-content-panel`);e&&(e.hidden=!0,e.innerHTML=``)}async function Jt(e,t){if(e?.isPublic&&e.id&&t?.id){Nt?.abort(),Nt=new AbortController;try{let n=await window.fetch(`/api/v1/kml/shared/${encodeURIComponent(e.id)}/features/${encodeURIComponent(t.id)}/content`,{signal:Nt.signal}),r=await n.json();if(!n.ok||r.code!==0)throw Error(r.error?.message||`点位内容加载失败`);return r.result}finally{Nt=null}}return K(t)}function Yt(e,t){let n=String(t?.description||``).trim(),r=Array.isArray(t?.coordinates)&&t.type===`Point`?`${Number(t.coordinates[0]).toFixed(6)}, ${Number(t.coordinates[1]).toFixed(6)}`:``;return`
    <section class="kml-content-overview">
      ${n?`<p>${G(n)}</p>`:`<p class="kml-content-muted">暂无描述</p>`}
      <dl>
        <div><dt>图层</dt><dd>${G(e?.name||`未命名图层`)}</dd></div>
        <div><dt>类型</dt><dd>${G(t?.type||`未知`)}</dd></div>
        ${r?`<div><dt>坐标</dt><dd>${G(r)}</dd></div>`:``}
      </dl>
    </section>
  `}function Xt(e){return`
    <a class="kml-content-image-item" href="${G(e.url)}" target="_blank" rel="noopener noreferrer" title="${G(e.title||`图片`)}">
      <img src="${G(e.thumbnailUrl||e.url)}" alt="${G(e.title||`点位图片`)}" loading="lazy">
    </a>
  `}function Zt(e){return`
    <article class="kml-content-card">
      <video controls preload="metadata" src="${G(e.url)}"></video>
      <a href="${G(e.url)}" target="_blank" rel="noopener noreferrer">${G(e.title||`打开视频`)}</a>
    </article>
  `}function Qt(e){let t=e.embedPolicy||{};return`
    <article class="kml-content-card">
      <iframe src="${G(e.url)}" title="${G(e.title||`点位页面`)}" sandbox="${G(t.sandbox||`allow-scripts allow-forms allow-popups`)}" referrerpolicy="${G(t.referrerPolicy||`no-referrer`)}" loading="lazy"></iframe>
      <a href="${G(e.url)}" target="_blank" rel="noopener noreferrer">${G(e.title||`打开页面`)}</a>
    </article>
  `}function J(e){return`
    <a class="kml-content-link-item" href="${G(e.url)}" target="_blank" rel="noopener noreferrer">
      <span>${G(e.title||`链接`)}</span>
      <small>${G(e.displayUrl||e.url)}</small>
    </a>
  `}function $t(e){if(!e.items?.length)return``;let t={image:Xt,video:Zt,iframe:Qt,link:J}[e.type]||J;return`
    <section class="kml-content-group kml-content-group-${G(e.type)}">
      <h3>${G(e.title||At[e.type]||`内容`)}</h3>
      <div class="kml-content-items">
        ${e.items.map(t).join(``)}
      </div>
    </section>
  `}function en(e,t,n,r,i=``){let a=q(r?.contentSummary),o=(r?.groups||[]).map($t).join(``);e.innerHTML=`
    <header class="kml-content-header">
      <div>
        <span class="kml-content-kicker">${G(t?.isPublic?`公共点位`:`个人点位`)}</span>
        <h2>${G(n?.name||`未命名点位`)}</h2>
        ${a?`<p>${G(a)}</p>`:``}
      </div>
      <button type="button" class="kml-content-close" data-kml-content-close aria-label="关闭">×</button>
    </header>
    <div class="kml-content-body">
      ${Yt(t,n)}
      ${i?`<div class="kml-content-error">${G(i)}</div>`:``}
      ${o||`<div class="kml-content-empty">暂无可展示的富媒体内容</div>`}
      ${r?.sourceSummary?.truncated?`<div class="kml-content-muted">内容较多，仅展示前 50 个链接。</div>`:``}
    </div>
  `,e.querySelector(`[data-kml-content-close]`)?.addEventListener(`click`,qt)}async function tn(e,t){let n=Kt();n.hidden=!1,n.innerHTML=`
    <header class="kml-content-header">
      <div>
        <span class="kml-content-kicker">${G(e?.isPublic?`公共点位`:`个人点位`)}</span>
        <h2>${G(t?.name||`未命名点位`)}</h2>
      </div>
      <button type="button" class="kml-content-close" data-kml-content-close aria-label="关闭">×</button>
    </header>
    <div class="kml-content-body">
      <div class="kml-content-loading">正在加载点位内容...</div>
    </div>
  `,n.querySelector(`[data-kml-content-close]`)?.addEventListener(`click`,qt);try{en(n,e,t,await Jt(e,t))}catch(r){if(r.name===`AbortError`)return;en(n,e,t,K(t),r.message||`点位内容加载失败，已展示本地解析结果。`)}}var nn=`data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA`,rn=`/location-keepalive.mp4`;function an(e,t){return Object.prototype.hasOwnProperty.call(e,t)?e[t]:globalThis?.[t]}function on(){}function sn(e={}){let t=an(e,`navigator`),n=an(e,`document`),r=an(e,`Audio`),i=an(e,`logger`)||globalThis.console,a=!1,o=0,s=!1,c=null,l=on,u=null,d=null,f={element:null,playPromise:null,playing:!1},p={element:null,playPromise:null,playing:!1,attached:!1};function m(e,t){try{i?.warn?.(`[LocationKeepAlive] ${e}`,t)}catch{}}function h(){return n?typeof n.visibilityState==`string`?n.visibilityState===`visible`:typeof n.hidden==`boolean`?!n.hidden:!0:!0}function g(e,t,{muted:n=!1}={}){if(!e)return null;try{e.src=t,e.loop=!0,e.setAttribute?.(`playsinline`,``),n&&(e.muted=!0,e.setAttribute?.(`muted`,``))}catch(e){m(`初始化媒体保活资源失败`,e)}return e}function _(){if(f.element)return f.element;try{typeof r==`function`?f.element=g(new r(nn),nn):typeof n?.createElement==`function`&&(f.element=g(n.createElement(`audio`),nn))}catch(e){m(`创建音频保活资源失败`,e)}return f.element}function ee(){let e=p.element;if(!(!e||p.attached||!n?.body?.appendChild))try{n.body.appendChild(e),p.attached=!0}catch(e){m(`挂载视频保活资源失败`,e)}}function te(){if(!p.element){if(typeof n?.createElement!=`function`)return null;try{let e=g(n.createElement(`video`),rn,{muted:!0});e&&(e.referrerPolicy=`no-referrer`,e.setAttribute?.(`referrerpolicy`,`no-referrer`)),e?.style&&(e.style.position=`absolute`,e.style.width=`1px`,e.style.height=`1px`,e.style.opacity=`0.01`,e.style.pointerEvents=`none`),p.element=e}catch(e){m(`创建视频保活资源失败`,e)}}return ee(),p.element}function v(e){if(e.playing=!1,e.element)try{e.element.pause?.()}catch(e){m(`暂停媒体保活资源失败`,e)}}function y(e,t,n){if(!a)return Promise.resolve(!1);let r=t();if(!r||typeof r.play!=`function`)return Promise.resolve(!1);if(e.playing&&r.paused!==!0)return Promise.resolve(!0);if(e.playPromise)return e.playPromise;let i;try{i=r.play()}catch(e){return m(`${n}保活播放失败`,e),Promise.resolve(!1)}let o=Promise.resolve(i).then(()=>a?(e.playing=!0,!0):(v(e),!1)).catch(t=>(e.playing=!1,m(`${n}保活播放失败`,t),!1)).finally(()=>{e.playPromise===o&&(e.playPromise=null)});return e.playPromise=o,o}function ne(){return y(f,_,`音频`)}function b(){return y(p,te,`视频`)}function re(){l(),l=on}function x(e,t){re();let n=()=>{c===e&&(c=null,re(),a&&o===t&&h()&&(u?.generation===t?d=t:T()))};if(typeof e?.addEventListener==`function`){e.addEventListener(`release`,n,{once:!0}),l=()=>{try{e.removeEventListener?.(`release`,n)}catch{}},e.released===!0&&n();return}if(e&&`onrelease`in e){let t=e.onrelease;e.onrelease=function(...e){try{t?.apply(this,e)}finally{n()}},l=()=>{e.onrelease!==t&&(e.onrelease=t||null)},e.released===!0&&n()}}async function S(e){if(!(!e||e.released===!0||typeof e.release!=`function`))try{await e.release()}catch(e){m(`释放 Screen Wake Lock 失败`,e)}}function ie(e){if(!a||o!==e||!h())return Promise.resolve(null);if(c?.released!==!0){if(c)return v(p),Promise.resolve(c)}else c=null,re();if(u?.generation===e)return u.promise;let n=t?.wakeLock;if(typeof n?.request!=`function`)return b().then(()=>null);let r=Promise.resolve().then(()=>n.request(`screen`)).then(async t=>t?!a||o!==e||!h()?(await S(t),null):t.released===!0?(await b(),null):c&&c!==t&&c.released!==!0?(await S(t),c):(c=t,x(t,e),v(p),c===t?t:null):(a&&o===e&&h()&&await b(),null)).catch(async t=>(a&&o===e&&h()&&(m(`申请 Screen Wake Lock 失败，启用视频降级保活`,t),await b()),null)).finally(()=>{u?.promise===r&&(u=null),d===e&&(d=null,a&&o===e&&h()&&T())});return u={generation:e,promise:r},r}function C(){a&&h()&&T()}function ae(){if(!(s||typeof n?.addEventListener!=`function`))try{n.addEventListener(`visibilitychange`,C),s=!0}catch(e){m(`监听页面可见性变化失败`,e)}}function w(){if(s){try{n?.removeEventListener?.(`visibilitychange`,C)}catch{}s=!1}}async function T(){if(!a)return!1;ae();let e=o,t=await Promise.allSettled([ne(),ie(e)]);return a&&o===e&&t.length===2}function E(){return a||(a=!0,o+=1,ae()),T()}function oe(){a=!1,o+=1,d=null,w();let e=c;c=null,re(),v(f),v(p),S(e)}return{start:E,stop:oe,refresh:T,startLocationKeepAlive:E,stopLocationKeepAlive:oe,refreshLocationKeepAlive:T}}var Y=null;function cn(){return Y||=sn(),Y}function ln(){return cn().start()}function un(){return cn().stop()}var dn=`/api/v1`,fn=`mapServiceAdminToken`;function pn(){return window.localStorage.getItem(fn)||``}function mn(e){e?window.localStorage.setItem(fn,e):window.localStorage.removeItem(fn)}async function X(e,t={}){let n={Accept:`application/json`,...t.headers||{}};if(t.body!==void 0&&(typeof window<`u`&&t.body instanceof window.FormData||(n[`Content-Type`]=`application/json`)),t.auth!==!1){let e=pn();e&&(n.Authorization=`Bearer ${e}`)}let r=await window.fetch(`${dn}${e}`,{method:t.method||`GET`,headers:n,body:t.body===void 0?void 0:typeof window<`u`&&t.body instanceof window.FormData?t.body:JSON.stringify(t.body)}),i=await r.json().catch(()=>null);if(!r.ok||i?.code!==0){let e=i?.error?.message||r.statusText||`请求失败`,t=Error(e);throw t.status=r.status,t}return i.result}async function hn(e){let t=await X(`/admin/auth/login`,{method:`POST`,auth:!1,body:e});return mn(t.token),t}function gn(){mn(``)}var Z={session:()=>X(`/admin/session`),system:()=>X(`/admin/system`),cache:()=>X(`/admin/cache`),clearCache:(e={})=>{let t=new URLSearchParams(e).toString();return X(`/admin/cache${t?`?${t}`:``}`,{method:`DELETE`})},visits:()=>X(`/admin/visits`),settings:()=>X(`/admin/settings`),updateSettings:e=>X(`/admin/settings`,{method:`PUT`,body:e}),updatePassword:e=>X(`/admin/auth/password`,{method:`POST`,body:e}),precacheCatalog:()=>X(`/admin/precache/catalog`),tasks:()=>X(`/admin/precache/tasks`),estimateTask:e=>X(`/admin/precache/estimate`,{method:`POST`,body:e}),createTask:e=>X(`/admin/precache/tasks`,{method:`POST`,body:e}),pauseTask:e=>X(`/admin/precache/tasks/${encodeURIComponent(e)}/pause`,{method:`POST`}),resumeTask:e=>X(`/admin/precache/tasks/${encodeURIComponent(e)}/resume`,{method:`POST`}),deleteTask:(e,t={})=>{let n=new URLSearchParams;t.deleteCache&&n.set(`deleteCache`,`true`);let r=n.toString();return X(`/admin/precache/tasks/${encodeURIComponent(e)}${r?`?${r}`:``}`,{method:`DELETE`})},kmls:()=>X(`/admin/kml`),getKml:e=>X(`/admin/kml/${encodeURIComponent(e)}`),createKml:e=>X(`/admin/kml`,{method:`POST`,body:e}),updateKml:(e,t)=>X(`/admin/kml/${encodeURIComponent(e)}`,{method:`PUT`,body:t}),deleteKml:e=>X(`/admin/kml/${encodeURIComponent(e)}`,{method:`DELETE`}),importKml:e=>X(`/admin/kml/import`,{method:`POST`,body:e}),listTileSources:()=>X(`/admin/tile-sources`),createTileSource:e=>X(`/admin/tile-sources`,{method:`POST`,body:e}),getTileSource:e=>X(`/admin/tile-sources/${encodeURIComponent(e)}`),updateTileSource:(e,t)=>X(`/admin/tile-sources/${encodeURIComponent(e)}`,{method:`PUT`,body:t}),deleteTileSource:e=>X(`/admin/tile-sources/${encodeURIComponent(e)}`,{method:`DELETE`}),testTileSource:e=>X(`/admin/tile-sources/${encodeURIComponent(e)}/test`,{method:`POST`}),listSourcePresets:()=>X(`/admin/source-presets`),createSourceFromPreset:(e,t)=>X(`/admin/source-presets/${encodeURIComponent(e)}/create-source`,{method:`POST`,body:t}),listKeyPools:()=>X(`/admin/key-pools`),getKeyPool:e=>X(`/admin/key-pools/${encodeURIComponent(e)}`),createKeyPool:e=>X(`/admin/key-pools`,{method:`POST`,body:e}),updateKeyPool:(e,t)=>X(`/admin/key-pools/${encodeURIComponent(e)}`,{method:`PUT`,body:t}),deleteKeyPool:e=>X(`/admin/key-pools/${encodeURIComponent(e)}`,{method:`DELETE`}),testKeyPool:e=>X(`/admin/key-pools/${encodeURIComponent(e)}/test`,{method:`POST`}),testKeyPoolKey:(e,t)=>X(`/admin/key-pools/${encodeURIComponent(e)}/keys/${encodeURIComponent(t)}/test`,{method:`POST`}),listMapLayers:()=>X(`/admin/map-layers`),createMapLayer:e=>X(`/admin/map-layers`,{method:`POST`,body:e}),updateMapLayer:(e,t)=>X(`/admin/map-layers/${encodeURIComponent(e)}`,{method:`PUT`,body:t}),deleteMapLayer:e=>X(`/admin/map-layers/${encodeURIComponent(e)}`,{method:`DELETE`}),setDefaultMapLayer:e=>X(`/admin/map-layers-default`,{method:`PUT`,body:{id:e}}),listProxyOutbounds:()=>X(`/admin/proxy-outbounds`),createProxyOutbound:e=>X(`/admin/proxy-outbounds`,{method:`POST`,body:e}),updateProxyOutbound:(e,t)=>X(`/admin/proxy-outbounds/${encodeURIComponent(e)}`,{method:`PUT`,body:t}),deleteProxyOutbound:e=>X(`/admin/proxy-outbounds/${encodeURIComponent(e)}`,{method:`DELETE`}),testProxyOutbound:e=>X(`/admin/proxy-outbounds/${encodeURIComponent(e)}/test`,{method:`POST`}),listProxyPools:()=>X(`/admin/proxy-pools`),createProxyPool:e=>X(`/admin/proxy-pools`,{method:`POST`,body:e}),updateProxyPool:(e,t)=>X(`/admin/proxy-pools/${encodeURIComponent(e)}`,{method:`PUT`,body:t}),deleteProxyPool:e=>X(`/admin/proxy-pools/${encodeURIComponent(e)}`,{method:`DELETE`}),testProxyPool:e=>X(`/admin/proxy-pools/${encodeURIComponent(e)}/test`,{method:`POST`}),listExternalPublishes:()=>X(`/admin/external-publishes`),createExternalPublish:e=>X(`/admin/external-publishes`,{method:`POST`,body:e}),updateExternalPublish:(e,t)=>X(`/admin/external-publishes/${encodeURIComponent(e)}`,{method:`PUT`,body:t}),deleteExternalPublish:e=>X(`/admin/external-publishes/${encodeURIComponent(e)}`,{method:`DELETE`}),resetExternalPublishToken:e=>X(`/admin/external-publishes/${encodeURIComponent(e)}/token`,{method:`POST`}),testExternalPublish:e=>X(`/admin/external-publishes/${encodeURIComponent(e)}/test`,{method:`POST`}),listExternalPublishLogs:(e=``)=>X(e?`/admin/external-publishes/${encodeURIComponent(e)}/logs`:`/admin/external-publish-logs`),listSourceAccessLogs:(e=``)=>X(e?`/admin/tile-sources/${encodeURIComponent(e)}/access-logs`:`/admin/source-access-logs`)};async function _n(){return X(`/access/status`,{auth:!1})}async function vn(e){return X(`/access/verify`,{method:`POST`,auth:!1,body:{password:e}})}function yn(e=0){if(!e)return`0 B`;let t=[`B`,`KB`,`MB`,`GB`],n=e,r=0;for(;n>=1024&&r<t.length-1;)n/=1024,r+=1;return`${n.toFixed(r===0?0:1)} ${t[r]}`}function bn(e=0){let t=Math.floor(e),n=Math.floor(t/3600),r=Math.floor(t%3600/60),i=t%60;return n?`${n}h ${r}m`:r?`${r}m ${i}s`:`${i}s`}function xn(e){return e?new Date(e).toLocaleString():`-`}function Q(e){return String(e??``).replaceAll(`&`,`&amp;`).replaceAll(`<`,`&lt;`).replaceAll(`>`,`&gt;`).replaceAll(`"`,`&quot;`).replaceAll(`'`,`&#39;`)}function Sn(e,t){return`${e}?url=${encodeURIComponent(t).replace(/%7B/g,`{`).replace(/%7D/g,`}`)}`}function Cn(e){let t=e.system,n=e.visits||{},r=t?.package?.version||`-`,i=e.visitsError||(e.visitsLoading?`统计中`:``);return`
    <div class="admin-grid">
      <section class="admin-panel">
        <div class="admin-panel-head">
          <h2>系统</h2>
          <span class="admin-badge">${Q(r)}</span>
        </div>
        <dl class="admin-metrics">
          <div><dt>应用</dt><dd>${Q(t?.package?.name||`-`)}</dd></div>
          <div><dt>Node</dt><dd>${Q(t?.node||`-`)}</dd></div>
          <div><dt>进程</dt><dd>${Q(t?.pid||`-`)}</dd></div>
          <div><dt>运行</dt><dd>${bn(t?.uptime||0)}</dd></div>
          <div><dt>环境</dt><dd>${Q(t?.env||`-`)}</dd></div>
          <div><dt>时间</dt><dd>${xn(t?.serverTime)}</dd></div>
        </dl>
      </section>
      <section class="admin-panel admin-panel-wide">
        <div class="admin-panel-head">
          <h2>访问</h2>
          <span class="admin-badge">${Q(i||n.total||0)}</span>
        </div>
        <div class="admin-stat-row">
          ${Object.entries(n.statusGroups||{}).map(([e,t])=>{let n=``;return e.startsWith(`2`)?n=`status-2xx`:e.startsWith(`3`)?n=`status-3xx`:(e.startsWith(`4`)||e.startsWith(`5`))&&(n=`status-err`),`<div class="${n}"><span>${Q(e)}</span><strong>${t}</strong></div>`}).join(``)||`<div><span>请求</span><strong>${Q(i||0)}</strong></div>`}
        </div>
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead><tr><th>方法</th><th>路径</th><th>状态</th><th>时间</th></tr></thead>
            <tbody>
              ${(n.recentRequests||[]).slice(0,8).map(e=>{let t=``;return String(e.status).startsWith(`2`)?t=`badge-2xx`:String(e.status).startsWith(`3`)?t=`badge-3xx`:(String(e.status).startsWith(`4`)||String(e.status).startsWith(`5`))&&(t=`badge-err`),`
                  <tr>
                    <td><code class="admin-method-code">${Q(e.method)}</code></td>
                    <td class="admin-path-td">${Q(e.path)}</td>
                    <td><span class="admin-status-badge ${t}">${Q(e.status)}</span></td>
                    <td class="admin-time-td">${Q(e.timestamp)}</td>
                  </tr>
                `}).join(``)||`<tr><td colspan="4">暂无访问记录</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `}function wn(e){let t=e.cache||{},n=e.cacheError||(e.cacheLoading?`统计中`:``),r=t.bySource||{},i=e.tileSources||[];return`
    <section class="admin-panel">
      <div class="admin-panel-head">
        <h2>缓存治理</h2>
        <button type="button" class="btn-danger" data-admin-action="clear-cache">清空全部缓存</button>
      </div>
      
      <dl class="admin-metrics admin-metrics-five">
        <div class="metric-files"><dt>文件数</dt><dd>${Q(n||t.files||0)}</dd></div>
        <div class="metric-size"><dt>总大小</dt><dd>${yn(t.bytes||0)}</dd></div>
        <div class="metric-fresh"><dt>新鲜数</dt><dd>${t.fresh||0}</dd></div>
        <div class="metric-stale"><dt>可回退</dt><dd>${t.stale||0}</dd></div>
        <div class="metric-expired"><dt>过期数</dt><dd>${t.expired||0}</dd></div>
      </dl>

      <div class="admin-table-wrapper" style="margin-top: 24px;">
        <table class="admin-table">
          <thead>
            <tr>
              <th>图源名称</th>
              <th>图源 ID</th>
              <th>文件数</th>
              <th>体积大小</th>
              <th>状态分布 (新鲜/可回退/过期)</th>
              <th class="actions">操作</th>
            </tr>
          </thead>
          <tbody>
            ${Object.entries(r).map(([e,t])=>{let n=i.find(t=>t.id===e);return`
                <tr>
                  <td><strong>${Q(n?n.name:`专用/未知图源`)}</strong></td>
                  <td><code class="code-slug">${Q(e)}</code></td>
                  <td>${t.files||0}</td>
                  <td>${yn(t.size||0)}</td>
                  <td>
                    <span class="status-badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: none; font-weight: bold; padding: 2px 6px; border-radius: 4px;">${t.fresh||0}</span>
                    <span class="status-badge" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: none; font-weight: bold; padding: 2px 6px; border-radius: 4px;">${t.stale||0}</span>
                    <span class="status-badge" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: none; font-weight: bold; padding: 2px 6px; border-radius: 4px;">${t.expired||0}</span>
                  </td>
                  <td class="actions">
                    <button type="button" class="btn-danger-sm" data-admin-action="clear-source-cache" data-source-id="${Q(e)}">清理缓存</button>
                  </td>
                </tr>
              `}).join(``)||`<tr><td colspan="6" class="empty-row">暂无分源缓存数据</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `}async function Tn({api:e,event:t,renderDashboard:n,setNotice:r,showConfirm:i,state:a}){let o=t.target.closest(`[data-admin-action]`);if(!o)return!1;let s=o.getAttribute(`data-admin-action`);if(s===`clear-cache`){if(!await i(`清空所有瓦片缓存？此操作不可逆！`))return!0;try{await e.clearCache(),a.cache=await e.cache(),r(`所有瓦片缓存已清空`),n()}catch(e){r(``,e.message),n()}return!0}if(s===`clear-source-cache`){let t=o.getAttribute(`data-source-id`);if(!t)return!1;let s=(a.tileSources||[]).find(e=>e.id===t),c=s?s.name:t;if(!await i(`确定要清空图源【${c}】的全部瓦片缓存吗？`))return!0;try{await e.clearCache({sourceId:t}),a.cache=await e.cache(),r(`已清空图源【${c}】的专属瓦片缓存`),n()}catch(e){r(``,e.message),n()}return!0}return!1}var En={queued:`排队中`,running:`执行中`,pausing:`暂停中`,paused:`已暂停`,completed:`已完成`,completed_with_errors:`完成有错误`,failed:`失败`,interrupted:`已中断`,deleting:`删除中`},Dn=1e3,On=1500,kn=new Set([`queued`,`running`,`pausing`,`deleting`]),An=null,jn=0,Mn=``,Nn=``,Pn=null,Fn=0;function In(e){return En[e]||e}var Ln={queued:`⏳`,running:`⚙`,pausing:`⏸`,paused:`⏸`,completed:`✓`,completed_with_errors:`⚠`,failed:`✗`,interrupted:`⏹`,deleting:`🗑`};function Rn(e){return Ln[e]||`•`}function zn(e,t){let n=t[0],r=e.precacheForm||{};return{providerId:t.some(e=>e.id===r.providerId)?r.providerId:n?.id||``,bounds:{west:Number(r.bounds?.west??113.24),south:Number(r.bounds?.south??23.11),east:Number(r.bounds?.east??113.29),north:Number(r.bounds?.north??23.15)},minZoom:Number(r.minZoom??12),maxZoom:Number(r.maxZoom??12),concurrency:Number(r.concurrency??4),requestIntervalMs:Number(r.requestIntervalMs??0),refresh:!!r.refresh}}function Bn(e,t){return e.find(e=>e.id===t.providerId)||e[0]||null}function Vn(e){let t=e.expandedTaskIds||new Set;return(e.tasks||[]).map(e=>({...e,expanded:t.has(e.id)}))}function Hn(e=[]){return e.some(e=>kn.has(e.status))}function Un(e){let t=e.precacheCatalog||[],n=zn(e,t),r=Bn(t,n),i=Vn(e);return`
    <div class="admin-precache-stack">
      <section class="admin-panel admin-panel-wide admin-precache-form-panel">
        <div class="admin-panel-head">
          <h2>预缓存区域</h2>
          <button type="button" data-admin-action="sync-bounds">取当前视野</button>
        </div>
        <form class="admin-search-form" data-place-search-form>
          <input name="keyword" placeholder="搜索地点，例如：广州塔" autocomplete="off">
          <button type="submit">搜索</button>
        </form>
        <div class="admin-search-results" data-place-search-results></div>
        <div id="admin-precache-map" class="admin-precache-map"></div>
        <div class="admin-map-resizer" title="拖动调整地图高度"><span class="admin-map-resizer-line"></span></div>
        <form class="admin-form admin-precache-form" data-precache-form>
          <label>
            <span>缓存图源/图层</span>
            <select name="providerId">
              <optgroup label="系统图源 (可预缓存)">
                ${t.filter(e=>e.type===`source`).map(e=>`
                  <option value="${Q(e.id)}" data-type="source" ${e.id===n.providerId?`selected`:``}>
                    ${Q(e.name)} (Z${e.minZoom}-Z${e.maxZoom})
                  </option>
                `).join(``)}
              </optgroup>
              <optgroup label="组合图层 (将自动拆分为多个预缓存任务)">
                ${t.filter(e=>e.type===`layer`).map(e=>`
                  <option value="${Q(e.id)}" data-type="layer" ${e.id===n.providerId?`selected`:``}>
                    ${Q(e.name)} (Z${e.minZoom}-Z${e.maxZoom})
                  </option>
                `).join(``)}
              </optgroup>
            </select>
          </label>
          <div class="admin-field-grid">
            <label><span>西</span><input name="west" type="number" step="0.000001" value="${Q(n.bounds.west)}" required></label>
            <label><span>南</span><input name="south" type="number" step="0.000001" value="${Q(n.bounds.south)}" required></label>
            <label><span>东</span><input name="east" type="number" step="0.000001" value="${Q(n.bounds.east)}" required></label>
            <label><span>北</span><input name="north" type="number" step="0.000001" value="${Q(n.bounds.north)}" required></label>
          </div>
          <div class="admin-field-grid">
            <label><span>最小级别</span><input name="minZoom" type="number" min="${r?.minZoom||3}" max="${r?.maxZoom||18}" value="${Q(n.minZoom)}" required></label>
            <label><span>最大级别</span><input name="maxZoom" type="number" min="${r?.minZoom||3}" max="${r?.maxZoom||18}" value="${Q(n.maxZoom)}" required></label>
            <label><span>并发</span><input name="concurrency" type="number" min="1" max="64" value="${Q(n.concurrency)}" required></label>
            <label><span>请求间隔 ms</span><input name="requestIntervalMs" type="number" min="0" max="60000" value="${Q(n.requestIntervalMs)}" required></label>
            <label class="admin-check admin-check-field"><input name="refresh" type="checkbox" ${n.refresh?`checked`:``}><span>刷新已有缓存</span></label>
          </div>
          ${Wn(e)}
          <button type="submit">创建任务</button>
        </form>
      </section>
      ${Jn(i)}
    </div>
  `}function Wn(e){let t=e.precacheEstimate;return e.precacheEstimateStatus===`loading`?`<div class="admin-estimate" data-precache-estimate><p>正在估算瓦片数量和下载体积</p></div>`:e.precacheEstimateError?`<div class="admin-estimate is-error" data-precache-estimate><p>${Q(e.precacheEstimateError)}</p></div>`:t?`
    <div class="admin-estimate ${t.withinLimit?``:`is-warning`}" data-precache-estimate>
      <dl class="admin-metrics">
        <div><dt>预计文件</dt><dd>${Q(t.total||0)}</dd></div>
        <div><dt>估算体积</dt><dd>${yn(t.estimatedBytesRange?.min||0)} - ${yn(t.estimatedBytesRange?.max||0)}</dd></div>
        <div><dt>建议上限</dt><dd>${Q(t.maxTiles||0)}</dd></div>
        <div><dt>建议</dt><dd>${t.withinLimit?`可以创建`:`任务较大，建议设置请求间隔`}</dd></div>
      </dl>
      <p>${qn(t)}</p>
    </div>
  `:`<div class="admin-estimate" data-precache-estimate><p>停止移动地图后会自动估算任务规模</p></div>`}function Gn(e){let t=e.root?.querySelector(`[data-precache-estimate]`);t&&(t.outerHTML=Wn(e))}function Kn(e){return e.length?e.map(e=>`Z${e.z}: ${e.count}`).join(`，`):`暂无分级明细`}function qn(e){if(e.targetType===`layer`){let t=e.sources||[];return t.length?t.map(e=>`${e.sourceName||e.sourceId}: ${e.total||0} 张，约 ${yn(e.estimatedBytes||0)}`).join(`，`):`暂无可预缓存图源明细`}return Kn(e.ranges||[])}function Jn(e){return`
    <section class="admin-panel admin-panel-wide admin-precache-task-panel" data-precache-task-panel>
      <div class="admin-panel-head">
        <h2>任务</h2>
        <span class="admin-badge">${e.length}</span>
      </div>
      <div class="admin-task-list">
        ${e.slice(0,10).map(e=>Yn(e)).join(``)||`<p class="admin-empty">暂无任务</p>`}
      </div>
    </section>
  `}function Yn(e){let t=e.expanded;return`
    <article class="admin-task-card">
      <div class="admin-task-main">
        <div class="admin-task-title">
          <span class="admin-status admin-status-${e.status}" title="${Q(In(e.status))}">${Q(Rn(e.status))}</span>
          <strong>${Q(e.providerId)}</strong>
          <small>${xn(e.updatedAt)}</small>
        </div>
        ${Xn(e)}
      </div>
      <dl class="admin-task-summary">
        <div><dt>体积</dt><dd>${yn(e.bytes||0)}</dd></div>
        <div><dt>级别</dt><dd>${Q(e.minZoom)}-${Q(e.maxZoom)}</dd></div>
        <div><dt>并发</dt><dd>${Q(e.concurrency||0)}</dd></div>
        <div><dt>间隔</dt><dd>${Q(e.requestIntervalMs||0)}ms</dd></div>
      </dl>
      ${Zn(e)}
      ${t?Qn(e):``}
    </article>
  `}function Xn(e){let t=Number(e.completed||0),n=Number(e.total||0),r=n?Math.min(100,Math.round(t/n*100)):0;return`
    <div class="admin-task-progress">
      <span>${Q(t)} / ${Q(n)} (${r}%)</span>
      <small>成功 ${Q(e.succeeded||0)}，失败 ${Q(e.failed||0)}</small>
    </div>
  `}function Zn(e){let t=[`queued`,`running`].includes(e.status),n=[`paused`,`interrupted`,`failed`,`completed_with_errors`].includes(e.status),r=e.status!==`deleting`,i=e.expanded?`收起`:`详情`;return`
    <div class="admin-task-actions">
      ${t?`<button type="button" data-precache-task-action="pause" data-task-id="${Q(e.id)}">暂停</button>`:``}
      ${n?`<button type="button" data-precache-task-action="resume" data-task-id="${Q(e.id)}">继续/重试</button>`:``}
      <button type="button" data-precache-task-action="edit" data-task-id="${Q(e.id)}">编辑</button>
      <button type="button" data-precache-task-action="update" data-task-id="${Q(e.id)}">更新</button>
      ${r?`<button type="button" data-precache-task-action="preview" data-task-id="${Q(e.id)}">预览</button>`:``}
      <button type="button" data-precache-task-action="toggle-details" data-task-id="${Q(e.id)}">${i}</button>
      <button type="button" class="danger" data-precache-task-action="delete" data-task-id="${Q(e.id)}">删除</button>
    </div>
  `}function Qn(e){let t=e.bounds||{},n=e.ranges||[],r=e.errors||[],i=Object.values(e.failedTiles||{});return`
    <div class="admin-task-details">
      <dl>
        <div><dt>区域</dt><dd>西 ${Q(t.west)} / 南 ${Q(t.south)} / 东 ${Q(t.east)} / 北 ${Q(t.north)}</dd></div>
        <div><dt>级别明细</dt><dd>${Kn(n)}</dd></div>
        <div><dt>失败待重试</dt><dd>${Q(i.length)}</dd></div>
        <div><dt>创建时间</dt><dd>${xn(e.createdAt)}</dd></div>
        <div><dt>完成时间</dt><dd>${xn(e.finishedAt)}</dd></div>
      </dl>
      ${i.length?`
        <div class="admin-task-errors">
          ${i.slice(-3).map(e=>`<p>Z${Q(e.tile?.z)} / X${Q(e.tile?.x)} / Y${Q(e.tile?.y)}：${Q(e.message||`未知错误`)}</p>`).join(``)}
        </div>
      `:``}
      ${r.length?`
        <div class="admin-task-errors">
          ${r.slice(-3).map(e=>`<p>${Q(e.message||`未知错误`)}</p>`).join(``)}
        </div>
      `:``}
    </div>
  `}function $n(e,t){_r(e,t);let n=t.elements.providerId,r=n.options[n.selectedIndex]?.getAttribute(`data-type`)||`source`,i=n.value;return{targetType:r,targetId:i,providerId:i,bounds:{west:Number(t.elements.west.value),south:Number(t.elements.south.value),east:Number(t.elements.east.value),north:Number(t.elements.north.value)},minZoom:Number(t.elements.minZoom.value),maxZoom:Number(t.elements.maxZoom.value),concurrency:Number(t.elements.concurrency.value),requestIntervalMs:Number(t.elements.requestIntervalMs.value),refresh:t.elements.refresh.checked}}function er(e,t){e.tasks=e.tasks.map(e=>e.id===t.id?t:e)}function tr(e,t){e.tasks=e.tasks.filter(e=>e.id!==t)}function nr(e){let t=e.root?.querySelector(`[data-precache-task-panel]`);t&&(t.outerHTML=Jn(Vn(e)))}function rr(e){return Array.isArray(e)?`[${e.map(rr).join(`,`)}]`:e&&typeof e==`object`?`{${Object.keys(e).sort().map(t=>`${JSON.stringify(t)}:${rr(e[t])}`).join(`,`)}}`:JSON.stringify(e)}function ir(e){jn+=1,Mn=``,e.precacheEstimate=null,e.precacheEstimateStatus=``,e.precacheEstimateError=``,Gn(e)}function ar(e,t,n=Dn){e.activeTab===`precache`&&(window.clearTimeout(An),An=window.setTimeout(()=>{or(e,t)},n))}async function or(e,t){if(e.activeTab!==`precache`)return;let n=e.root?.querySelector(`[data-precache-form]`);if(!n)return;let r=$n(e,n),i=rr(r);if(i===Nn||i===Mn)return;let a=jn+1;jn=a,Mn=i,e.precacheEstimateStatus=`loading`,e.precacheEstimateError=``,Gn(e);try{let n=await t.estimateTask(r);if(a!==jn)return;e.precacheEstimate=n,e.precacheEstimateStatus=``,e.precacheEstimateError=``,Nn=i,Mn=``,Gn(e)}catch(t){if(a!==jn)return;e.precacheEstimate=null,e.precacheEstimateStatus=``,e.precacheEstimateError=t.message,Mn=``,Gn(e)}}function sr(e,t,n=On){window.clearTimeout(Pn),!(e.activeTab!==`precache`||!Hn(e.tasks))&&(Pn=window.setTimeout(()=>{cr(e,t)},n))}async function cr(e,t){if(e.activeTab!==`precache`)return;let n=Fn+1;Fn=n;try{let r=await t.tasks();if(n!==Fn||e.activeTab!==`precache`)return;e.tasks=r,nr(e),sr(e,t)}catch(n){console.warn(`预缓存任务状态刷新失败`,n),sr(e,t,On*2)}}async function lr({api:e,event:t,renderDashboard:n,setNotice:r,state:i}){let a=t.target.closest(`[data-precache-form]`),o=t.target.closest(`[data-place-search-form]`);if(a)return t.preventDefault(),e.createTask($n(i,a)).then(t=>{Array.isArray(t)?(i.tasks=[...t,...i.tasks],r(`成功创建了 ${t.length} 个图源缓存子任务`)):(i.tasks=[t,...i.tasks],r(`预缓存任务已创建`)),n(),sr(i,e,300)}).catch(e=>{r(``,e.message),n()}),!0;if(o){t.preventDefault();let e=o.elements.keyword.value.trim();return e&&await Sr(i,e),!0}return!1}async function ur({api:e,event:t,renderDashboard:n,setNotice:r,showCheckboxConfirm:i,showConfirm:a,state:o}){let s=t.target.closest(`[data-precache-task-action]`);if(s)return await fr({actionTarget:s,api:e,renderDashboard:n,setNotice:r,showCheckboxConfirm:i,showConfirm:a,state:o}),!0;let c=t.target.closest(`[data-place-lng][data-place-lat]`);return c?(br(o,Number(c.getAttribute(`data-place-lng`)),Number(c.getAttribute(`data-place-lat`))),!0):t.target.closest(`[data-admin-action]`)?.getAttribute(`data-admin-action`)===`sync-bounds`?(gr(o),ir(o),ar(o,e),!0):!1}async function dr({api:e,event:t,state:n}){let r=t.target.closest(`[data-precache-form]`);return r?(_r(n,r),ir(n),ar(n,e),!0):!1}async function fr({actionTarget:e,api:t,renderDashboard:n,setNotice:r,showCheckboxConfirm:i,showConfirm:a,state:o}){let s=e.getAttribute(`data-precache-task-action`),c=e.getAttribute(`data-task-id`),l=o.tasks.find(e=>e.id===c);if(!(!s||!c))try{if(s===`pause`){er(o,await t.pauseTask(c)),r(`预缓存任务已暂停`),n(),sr(o,t,300);return}if(s===`resume`){er(o,await t.resumeTask(c)),r(`预缓存任务已继续`),n(),sr(o,t,300);return}if(s===`delete`){let e=!1;if(i instanceof Function){let t=await i(`删除此预缓存任务？执行中的任务会停止并从列表移除。`,{confirmText:`删除`,checkboxLabel:`同时删除该任务范围内已缓存的瓦片文件`});if(!t?.confirmed)return;e=!!t.checked}else if(!await a(`删除此预缓存任务？执行中的任务会停止并从列表移除。`))return;await t.deleteTask(c,{deleteCache:e}),tr(o,c),r(e?`预缓存任务已删除，关联缓存文件清理已提交`:`预缓存任务已删除`),n();return}if(s===`edit`&&l){yr(o,l),ir(o),ar(o,t),r(`任务参数已回填，可调整后创建新任务`),n();return}if(s===`update`&&l){o.tasks=[await t.createTask({providerId:l.providerId,bounds:l.bounds,minZoom:l.minZoom,maxZoom:l.maxZoom,concurrency:l.concurrency,requestIntervalMs:l.requestIntervalMs||0,refresh:!1}),...o.tasks],r(`更新任务已创建，将跳过新鲜缓存并补齐缺失瓦片`),n(),sr(o,t,300);return}if(s===`toggle-details`){o.expandedTaskIds.has(c)?o.expandedTaskIds.delete(c):o.expandedTaskIds.add(c),n();return}s===`preview`&&l&&(window.location.href=vr(l))}catch(e){r(``,e.message),n(),sr(o,t,300)}}async function pr(e){return e.AMap?e.AMap:(window._AMapSecurityConfig={securityJsCode:m.securityJsCode},e.amapLoader?(e.AMap=await e.amapLoader.load({key:m.key,version:`2.0`,plugins:m.plugins}).catch(e=>(console.warn(`高德 JSAPI 加载失败，后台地点搜索不可用`,e),null)),e.AMap):(console.warn(`高德 JSAPI Loader 未初始化，后台地点搜索不可用`),null))}function mr(e){let t=e.root.querySelector(`[data-precache-form]`);return{west:Number(t?.elements.west.value),south:Number(t?.elements.south.value),east:Number(t?.elements.east.value),north:Number(t?.elements.north.value)}}function hr(e,t){let n=e.root.querySelector(`[data-precache-form]`);n&&(n.elements.west.value=t.getWest().toFixed(6),n.elements.south.value=t.getSouth().toFixed(6),n.elements.east.value=t.getEast().toFixed(6),n.elements.north.value=t.getNorth().toFixed(6),_r(e,n))}function gr(e){if(!e.map||!e.rectangle)return;let t=e.map.getBounds();e.rectangle.setBounds(t),hr(e,t)}function _r(e,t){return t?(e.precacheForm={providerId:t.elements.providerId.value,bounds:{west:Number(t.elements.west.value),south:Number(t.elements.south.value),east:Number(t.elements.east.value),north:Number(t.elements.north.value)},minZoom:Number(t.elements.minZoom.value),maxZoom:Number(t.elements.maxZoom.value),concurrency:Number(t.elements.concurrency.value),requestIntervalMs:Number(t.elements.requestIntervalMs.value),refresh:t.elements.refresh.checked},e.precacheForm):null}function vr(e){let t=e.bounds||{},n=(Number(t.south)+Number(t.north))/2,r=(Number(t.west)+Number(t.east))/2,i=Number(e.maxZoom||e.minZoom||h.zoom);if(!Number.isFinite(n)||!Number.isFinite(r))return`/`;let a=[n.toFixed(6),r.toFixed(6),Math.max(3,Math.min(20,i)),0].join(`,`);return`/?coords=${encodeURIComponent(a)}`}function yr(e,t){if(!t)return;let n=t.bounds||{};e.precacheForm={providerId:t.providerId||e.precacheForm?.providerId||``,bounds:{west:Number(n.west),south:Number(n.south),east:Number(n.east),north:Number(n.north)},minZoom:Number(t.minZoom),maxZoom:Number(t.maxZoom),concurrency:Number(t.concurrency||e.precacheForm?.concurrency||4),requestIntervalMs:Number(t.requestIntervalMs||e.precacheForm?.requestIntervalMs||0),refresh:!1}}function br(e,t,n,r=15){e.map&&(e.map.setView([n,t],r),gr(e),e.onPrecacheBoundsChange instanceof Function&&e.onPrecacheBoundsChange())}function xr(e,t){sr(e,t);let n=e.root.querySelector(`#admin-precache-map`);if(!n)return;e.precacheMapHeight&&(n.style.height=`${e.precacheMapHeight}px`),e.onPrecacheBoundsChange=()=>ar(e,t),document.querySelectorAll(`.amap-sug-result`).forEach(e=>e.remove()),e.map&&(e.map.remove(),e.map=null,e.rectangle=null);let r=p.default.map(n,{center:h.center,zoom:Math.min(h.zoom,13),zoomControl:!0,attributionControl:!1});p.default.tileLayer(Sn(g,`https://webst01.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}`),{minZoom:3,maxZoom:18,keepBuffer:4}).addTo(r);let i=mr(e),a=p.default.latLngBounds([i.south,i.west],[i.north,i.east]);e.rectangle=p.default.rectangle(a,{color:`#0f766e`,weight:2,fillColor:`#f59e0b`,fillOpacity:.14}).addTo(r);let o=!1;r.fitBounds(a),r.on(`moveend zoomend`,()=>gr(e)),r.on(`moveend zoomend`,()=>{o&&e.onPrecacheBoundsChange instanceof Function&&e.onPrecacheBoundsChange()}),window.requestAnimationFrame(()=>{o=!0}),e.map=r;let s=e.root.querySelector(`[data-place-search-form] input[name="keyword"]`);s&&(s.id=`admin-precache-search-input`,pr(e).then(t=>{t&&t.AutoComplete&&new t.AutoComplete({input:`admin-precache-search-input`}).on(`select`,t=>{if(t.poi?.location){let{lng:n,lat:r}=t.poi.location;br(e,n,r)}})}));let c=e.root.querySelector(`.admin-map-resizer`);if(c&&n){let t=0,r=0,i=e=>{t=e.clientY,r=n.offsetHeight,document.addEventListener(`pointermove`,a),document.addEventListener(`pointerup`,o),c.classList.add(`is-dragging`),e.preventDefault()},a=i=>{let a=i.clientY-t,o=Math.min(800,Math.max(150,r+a));n.style.height=`${o}px`,e.precacheMapHeight=o,e.map&&e.map.invalidateSize()},o=()=>{document.removeEventListener(`pointermove`,a),document.removeEventListener(`pointerup`,o),c.classList.remove(`is-dragging`)};c.addEventListener(`pointerdown`,i)}}async function Sr(e,t){let n=e.root.querySelector(`[data-place-search-results]`);if(!n)return;let r=await pr(e);if(!r){n.innerHTML=`<p>高德搜索暂不可用</p>`;return}let i=new r.PlaceSearch({pageSize:8,pageIndex:1});n.innerHTML=`<p>正在搜索</p>`,i.search(t,(e,t)=>{if(e!==`complete`||!t?.poiList?.pois?.length){n.innerHTML=`<p>没有找到匹配地点</p>`;return}n.innerHTML=t.poiList.pois.map(e=>{let t=e.location;return`
        <button type="button" data-place-lng="${t.lng}" data-place-lat="${t.lat}">
          <strong>${Q(e.name)}</strong>
          <span>${Q(e.address||e.district||``)}</span>
        </button>
      `}).join(``)})}var Cr=4;function wr(e){let t=e.settings?.access||{},n=e.settings?.auth||{},r=n.tokenTtl?Math.round(n.tokenTtl/(1e3*60*60*24)):15;return`
    <div class="admin-grid">
      <section class="admin-panel">
        <div class="admin-panel-head">
          <h2>访问控制</h2>
          <span class="admin-badge">${t.enabled?`ON`:`OFF`}</span>
        </div>
        <form class="admin-form" data-access-form autocomplete="off">
          <label class="admin-check">
            <input type="checkbox" name="accessEnabled" ${t.enabled?`checked`:``}>
            <span>启用访问密码</span>
          </label>
          <label>
            <span>设置访问密码</span>
            <input name="accessPassword" type="password" autocomplete="new-password" placeholder="${t.hasPassword?`已设置，输入新密码以修改`:`输入至少 ${Cr} 位访问密码`}">
          </label>
          ${t.hasPassword?`
            <label class="admin-check">
              <input type="checkbox" name="clearAccessPassword">
              <span>清除已保存的访问密码</span>
            </label>
          `:``}
          <button type="submit">保存访问控制</button>
        </form>
      </section>

      <section class="admin-panel">
        <div class="admin-panel-head">
          <h2>登录态设置</h2>
        </div>
        <form class="admin-form" data-auth-settings-form autocomplete="off">
          <label>
            <span>登录态有效时长 (天)</span>
            <input name="tokenTtlDays" type="number" min="1" max="365" required value="${r}" placeholder="请输入天数，默认 15">
          </label>
          <button type="submit">保存登录设置</button>
        </form>
      </section>

      <section class="admin-panel">
        <div class="admin-panel-head">
          <h2>修改管理密码</h2>
        </div>
        <form class="admin-form" data-admin-password-form autocomplete="off">
          <label>
            <span>当前密码</span>
            <input name="currentPassword" type="password" required autocomplete="current-password" placeholder="请输入当前密码">
          </label>
          <label>
            <span>新密码</span>
            <input name="newPassword" type="password" required autocomplete="new-password" placeholder="请输入新密码（至少4位）">
          </label>
          <label>
            <span>确认新密码</span>
            <input name="confirmPassword" type="password" required autocomplete="new-password" placeholder="请再次输入新密码">
          </label>
          <button type="submit">修改密码</button>
        </form>
      </section>
    </div>
  `}async function Tr({api:e,event:t,renderDashboard:n,setNotice:r,state:i}){let a=t.target.closest(`[data-access-form]`),o=t.target.closest(`[data-admin-password-form]`),s=t.target.closest(`[data-auth-settings-form]`);if(a){t.preventDefault();try{let t=a.elements.accessEnabled.checked,o=a.elements.accessPassword.value.trim(),s=a.elements.clearAccessPassword?.checked||!1,c={access:{enabled:t}};if(o){if(o.length<Cr)return r(``,`访问密码长度至少为 ${Cr} 位`),n(),!0;c.access.password=o}else if(s)c.access.clearPassword=!0;else if(t&&!i.settings?.access?.hasPassword)return r(``,`启用访问密码时，必须设置访问密码`),n(),!0;if(t&&s&&!o)return r(``,`启用访问密码时不能同时清除密码`),n(),!0;i.settings=await e.updateSettings(c),r(`访问控制已保存`),n()}catch(e){r(``,e.message),n()}return!0}if(s){t.preventDefault();try{let t=Number(s.elements.tokenTtlDays.value);if(isNaN(t)||t<=0)return r(``,`有效时长必须是大于 0 的数字`),n(),!0;let a={auth:{tokenTtl:Math.round(t*24*60*60*1e3)}};i.settings=await e.updateSettings(a),r(`登录态设置已保存`),n()}catch(e){r(``,e.message),n()}return!0}if(o){t.preventDefault();let i=o.elements.currentPassword.value,a=o.elements.newPassword.value,s=o.elements.confirmPassword.value;if(a.length<4)return r(``,`新密码长度至少为 4 位`),n(),!0;if(a!==s)return r(``,`两次输入的新密码不一致`),n(),!0;try{await e.updatePassword({currentPassword:i,newPassword:a}),r(`管理密码修改成功！`),o.reset(),n()}catch(e){r(``,e.message),n()}return!0}return!1}function Er(e){let t=e.kmls||[];return`
    <section class="admin-panel">
      <div class="admin-panel-head">
        <h2>公共 KML 图层管理</h2>
        <span class="admin-badge">${t.length}</span>
        <div style="display: flex; gap: 8px;">
          <button type="button" class="btn-primary" data-admin-action="create-blank-kml">新建空白 KML</button>
          <button type="button" class="btn-primary" data-admin-action="trigger-import">导入 KML 文件</button>
          <input type="file" id="admin-kml-file-input" accept=".kml" style="display: none;">
        </div>
      </div>
      <div class="admin-table-container" style="overflow-x: auto; margin-top: 16px;">
        <table class="admin-table" style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
          <thead>
            <tr style="border-bottom: 2px solid #e2e8f0; color: #4a5568; font-weight: 600;">
              <th style="padding: 10px 8px;">图层名称</th>
              <th style="padding: 10px 8px;">要素数量</th>
              <th style="padding: 10px 8px;">坐标纠偏</th>
              <th style="padding: 10px 8px;">状态</th>
              <th style="padding: 10px 8px;">最后更新时间</th>
              <th style="padding: 10px 8px; text-align: right;">操作</th>
            </tr>
          </thead>
          <tbody>
            ${t.map(e=>{let t=`草稿`,n=`background: #f3f4f6; color: #4b5563;`;e.status===`published`?(t=`已发布`,n=`background: #dcfce7; color: #15803d;`):e.status===`disabled`&&(t=`已禁用`,n=`background: #ffedd5; color: #c2410c;`);let r=e.updatedAt?new Date(e.updatedAt).toLocaleString():`-`;return`
                <tr style="border-bottom: 1px solid #e2e8f0; height: 48px;">
                  <td style="padding: 10px 8px; font-weight: 500; color: #1a202c;">${Q(e.name)}</td>
                  <td style="padding: 10px 8px; color: #4a5568;">${e.features?e.features.length:e.featureCount||0}</td>
                  <td style="padding: 10px 8px; color: #4a5568;">
                    <label style="display: inline-flex; align-items: center; gap: 4px; cursor: pointer;">
                      <input type="checkbox" data-admin-action="toggle-correction" data-kml-id="${e.id}" ${e.coordCorrection===`none`?``:`checked`}>
                      <span>纠偏</span>
                    </label>
                  </td>
                  <td style="padding: 10px 8px;">
                    <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; ${n}">
                      ${t}
                    </span>
                  </td>
                  <td style="padding: 10px 8px; color: #718096;">${Q(r)}</td>
                  <td style="padding: 10px 8px; text-align: right;">
                    <div style="display: inline-flex; gap: 6px;">
                      ${e.status===`published`?`
                        <button type="button" class="btn-xs" style="background: #ed8936; color: white;" data-admin-action="set-status" data-kml-id="${e.id}" data-kml-status="disabled">禁用</button>
                      `:`
                        <button type="button" class="btn-xs" style="background: #48bb78; color: white;" data-admin-action="set-status" data-kml-id="${e.id}" data-kml-status="published">发布</button>
                      `}
                      <button type="button" class="btn-xs" data-admin-action="rename" data-kml-id="${e.id}" data-kml-name="${Q(e.name)}">重命名</button>
                      <a class="btn-xs-link" href="/?editPublicKml=${e.id}" style="text-decoration: none; padding: 4px 8px; background: #3182ce; color: white; border-radius: 4px; display: inline-block; font-size: 11px; font-weight: 500;" target="_blank">编辑数据</a>
                      <button type="button" class="btn-xs" data-admin-action="export" data-kml-id="${e.id}">导出</button>
                      <button type="button" class="btn-xs btn-danger" style="padding: 4px 8px; font-size: 11px;" data-admin-action="delete" data-kml-id="${e.id}">删除</button>
                    </div>
                  </td>
                </tr>
              `}).join(``)||`<tr><td colspan="6" style="padding: 24px; text-align: center; color: #a0aec0;">暂无公共 KML 图层</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `}async function Dr({api:e,event:t,renderDashboard:n,setNotice:r,showConfirm:i,state:a}){let o=t.target.closest(`[data-admin-action]`);if(!o)return!1;let s=o.getAttribute(`data-admin-action`),c=o.getAttribute(`data-kml-id`);if(s===`create-blank-kml`){let t=await Ce({title:`新建公共 KML`,fields:[{name:`name`,label:`图层名称`,type:`text`}],values:{name:`新建公共 KML ${a.kmls.length+1}`}});if(!t||!t.name?.trim())return!0;try{r(`正在创建...`),await e.createKml({name:t.name.trim(),status:`draft`,coordCorrection:`wgs84-to-gcj02`,features:[]}),a.kmls=await e.kmls(),r(`新建成功`),n()}catch(e){r(``,e.message),n()}return!0}if(s===`trigger-import`)return document.getElementById(`admin-kml-file-input`)?.click(),!0;if(s===`set-status`){let t=o.getAttribute(`data-kml-status`);try{r(`正在更新状态...`),await e.updateKml(c,{status:t}),a.kmls=await e.kmls(),r(`状态已更新`),n()}catch(e){r(``,e.message),n()}return!0}if(s===`rename`){let t=o.getAttribute(`data-kml-name`),i=await Ce({title:`重命名公共 KML`,fields:[{name:`name`,label:`图层名称`,type:`text`}],values:{name:t}});if(!i||!i.name?.trim()||i.name.trim()===t)return!0;try{r(`正在重命名...`),await e.updateKml(c,{name:i.name.trim()}),a.kmls=await e.kmls(),r(`重命名成功`),n()}catch(e){r(``,e.message),n()}return!0}if(s===`export`){try{r(`正在获取数据...`);let t=await e.getKml(c);r(``);let n=Dt(t.name,t.features||[]),i=new Blob([n],{type:`application/vnd.google-earth.kml+xml;charset=utf-8`}),a=URL.createObjectURL(i),o=document.createElement(`a`);o.href=a,o.download=`${t.name}.kml`,document.body.appendChild(o),o.click(),document.body.removeChild(o),URL.revokeObjectURL(a)}catch(e){r(``,e.message),n()}return!0}if(s===`delete`){if(!await i(`确认永久删除此公共 KML 图层及其中所有要素？此操作不可撤销。`))return!0;try{r(`正在删除...`),await e.deleteKml(c),a.kmls=await e.kmls(),r(`删除成功`),n()}catch(e){r(``,e.message),n()}return!0}return!1}async function Or({api:e,event:t,renderDashboard:n,setNotice:r,state:i}){let a=t.target;if(a.id===`admin-kml-file-input`){let t=a.files[0];if(!t)return!0;let o=new FormData;o.append(`file`,t),o.append(`name`,t.name),o.append(`status`,`draft`),o.append(`coordCorrection`,`wgs84-to-gcj02`);try{r(`正在导入 KML 文件...`),await e.importKml(o),i.kmls=await e.kmls(),r(`导入成功（默认为草稿状态）`),n()}catch(e){r(``,e.message),n()}finally{a.value=``}return!0}if(a.matches(`[data-admin-action="toggle-correction"]`)){let t=a.getAttribute(`data-kml-id`),o=a.checked?`wgs84-to-gcj02`:`none`;try{r(`正在更新纠偏设置...`),await e.updateKml(t,{coordCorrection:o}),i.kmls=await e.kmls(),r(`纠偏设置已更新`),n()}catch(e){r(``,e.message),n()}return!0}return!1}var kr=216e5,Ar=2592e6,jr=60*1e3,Mr=60*jr,Nr=24*Mr,Pr={1:256,2:512,3:768},Fr=[[`xyz`,`XYZ 栅格`],[`tms`,`TMS 栅格`],[`xyz-raster`,`XYZ 栅格`],[`tms-raster`,`TMS 栅格`],[`wmts-raster`,`WMTS 栅格`],[`arcgis-raster`,`ArcGIS 栅格`],[`quadkey-raster`,`QuadKey 栅格`],[`time-raster`,`时间序列栅格`],[`mvt`,`MVT 矢量瓦片`],[`vector-tilejson`,`矢量 TileJSON`],[`vector-style`,`矢量 Style JSON`],[`pmtiles-vector`,`PMTiles 矢量`],[`pmtiles-raster`,`PMTiles 栅格`],[`google-map-tiles-api`,`Google Map Tiles API`]],Ir=[[`satellite`,`卫星`],[`road`,`街道/道路`],[`street`,`街道/道路`],[`label`,`注记`],[`terrain`,`地形`],[`vector`,`矢量`],[`overlay`,`叠加`],[`weather`,`天气`],[`other`,`其他`],[`custom`,`自定义`]],Lr=[[`query`,`Query 参数`],[`header`,`请求头`],[`bearer`,`Bearer Token`],[`session`,`会话/适配器`]],Rr=[[`round_robin`,`健康 Key 轮询`],[`priority_failover`,`优先级失败切换`],[`random`,`健康 Key 随机`],[`weighted_round_robin`,`按权重轮询`]],zr=[[`global`,`全局`],[`source`,`图源`],[`publish`,`发布项`]],Br=[[`leaflet`,`Leaflet 栅格`],[`maplibre`,`MapLibre 矢量`],[`cesium`,`Cesium 3D`]],Vr=new Set([`mvt`,`vector-tilejson`,`vector-style`,`pmtiles-vector`]),Hr=new Set([`pmtiles-vector`,`pmtiles-raster`]);function Ur(e){return e?.errorMessage||e?.error||``}function Wr(e,t=``){return e.map(([e,n])=>`<option value="${Q(e)}" ${t===e?`selected`:``}>${Q(n)}</option>`).join(``)}function Gr(e,t){return!e||t.some(([t])=>t===e)?``:`<option value="${Q(e)}" selected>${Q(e)}</option>`}function Kr(e=``){return Fr.find(([t])=>t===e)?.[1]||e||`-`}function qr(e=``){return Vr.has(e)}function Jr(e=``){return Hr.has(e)}function Yr(e={},t){return e.entry?.[t]||e[t]||``}function Xr(e={}){return e.kind===`vector-style`?Yr(e,`styleJsonUrl`):e.kind===`vector-tilejson`?Yr(e,`tileJsonUrl`):Jr(e.kind)?Yr(e,`pmtilesUrl`):Yr(e,`template`)}function Zr(e,t=`是`,n=`否`){return e?`<span class="badge-green">${Q(t)}</span>`:`<span class="badge-gray">${Q(n)}</span>`}function Qr(e=`ready`){return e===`ready`?`<span class="badge-green">可创建</span>`:e===`requires_adapter`?`<span class="badge-blue">需适配器</span>`:e===`research_only`?`<span class="badge-gray">调研参考</span>`:`<span class="badge-gray">${Q(e)}</span>`}function $r(e=[],t=``){return e.map(e=>`<option value="${Q(e.id)}" ${e.id===t?`selected`:``}>${Q(e.name)} (${Q(e.id)})</option>`).join(``)}function ei(e={},t=[]){return e.requiresKey&&(t.find(t=>(t.allowedPresetIds||[]).includes(e.presetId))||t.find(t=>t.id===`default-${e.vendor}-key-pool`)||t.find(t=>t.vendor===e.vendor&&t.scope===`global`))||null}function ti(e={},t=`申请 Key`){return e.credentialUrl?`<a href="${Q(e.credentialUrl)}" target="_blank" rel="noopener noreferrer" class="btn-link">${Q(t)}</a>`:``}function ni(e){return e===`layer`?`组合图层`:e===`dedicated_source`?`专用图源`:`系统图源`}function ri(e){return e.visibility?.scope===`external_only`?`专用发布`:`系统图源`}function ii(e,t){let n=window.location.origin,r=e.pathSlug,i=e.auth?.mode===`token`?`?token=您的TOKEN`:``,a=`${n}/api/v1/external/${r}/tilejson${i}`,o=`${n}/api/v1/external/${r}/tilejson.json${i}`,s=`${n}/api/v1/external/${r}/style.json${i}`,c=e.targetType===`source`||e.targetType===`dedicated_source`?(t.tileSources||[]).find(t=>t.id===e.targetId):null;if(c&&qr(c.kind)){let t=`${n}/api/v1/external/${r}/tiles/{z}/{x}/{y}.pbf${i}`,a=`${n}/api/v1/external/${r}.pmtiles${i}`,l=c.kind===`vector-style`?s:c.kind===`vector-tilejson`?o:Jr(c.kind)?a:t,u=c.kind===`vector-style`?`const map = new maplibregl.Map({
  container: 'map',
  style: '${s}'
});`:c.kind===`vector-tilejson`?`const style = {
  version: 8,
  sources: {
    tiles: { type: 'vector', url: '${o}' }
  },
  layers: []
};`:`// MVT/PMTiles 需要结合具体 source-layer 或 style 定义使用
// 资源入口: ${l}`;return`
      <div class="form-card" style="margin-top:25px; background:white;">
        <h4>矢量对外接入 URL 示例 : <strong>${Q(e.name)}</strong></h4>
        <div style="margin-top:10px; font-size:12px;">
          <div><strong>主入口 URL:</strong></div>
          <code style="background:#f1f5f9; padding:4px 8px; display:block; border-radius:4px; margin:4px 0; word-break:break-all;">${Q(l)}</code>
          <div style="margin-top:10px;"><strong>Style JSON:</strong></div>
          <code style="background:#f1f5f9; padding:4px 8px; display:block; border-radius:4px; margin:4px 0; word-break:break-all;">${Q(s)}</code>
          <div style="margin-top:10px;"><strong>TileJSON:</strong></div>
          <code style="background:#f1f5f9; padding:4px 8px; display:block; border-radius:4px; margin:4px 0; word-break:break-all;">${Q(o)}</code>
        </div>
        <div style="margin-top:20px;">
          <strong>MapLibre 加载接入示例:</strong>
          <div class="api-example">${Q(u)}</div>
        </div>
      </div>
    `}if(e.targetType===`layer`){let o=(t.mapLayers||[]).find(t=>t.id===e.targetId),s=(o?.items||[]).map(e=>({...e,url:`${n}/api/v1/external/${r}/sources/${e.sourceId}/{z}/{x}/{y}${i}`})),c=s.length?s.map(e=>`L.tileLayer('${e.url}', {
  minZoom: ${o?.minZoom??3},
  maxZoom: ${o?.maxZoom??18},
  opacity: ${e.opacity??1},
  attribution: '私有地图服务中心'
}).addTo(map);`).join(`

`):`// 当前组合图层没有可用图源`;return`
      <div class="form-card" style="margin-top:25px; background:white;">
        <h4>对外接入 URL 示例 : <strong>${Q(e.name)}</strong></h4>
        <div style="margin-top:10px; font-size:12px;">
          <div><strong>TileJSON 契约接口 URL:</strong></div>
          <code style="background:#f1f5f9; padding:4px 8px; display:block; border-radius:4px; margin:4px 0; word-break:break-all;">${Q(a)}</code>
          <div style="margin-top:10px;"><strong>组合图层图源瓦片地址:</strong></div>
          ${s.map(e=>`<code style="background:#f1f5f9; padding:4px 8px; display:block; border-radius:4px; margin:4px 0; word-break:break-all;">${Q(e.url)}</code>`).join(``)||`<p style="color:#64748b;">暂无可用图源地址</p>`}
        </div>

        <div style="margin-top:20px;">
          <strong>Leaflet 加载接入示例:</strong>
          <div class="api-example">${Q(c)}</div>
        </div>
      </div>
    `}let l=`${n}/api/v1/external/${r}/{z}/{x}/{y}${i}`;return`
    <div class="form-card" style="margin-top:25px; background:white;">
      <h4>对外接入 URL 示例 : <strong>${Q(e.name)}</strong></h4>
      <div style="margin-top:10px; font-size:12px;">
        <div><strong>TileJSON 契约接口 URL:</strong></div>
        <code style="background:#f1f5f9; padding:4px 8px; display:block; border-radius:4px; margin:4px 0; word-break:break-all;">${Q(a)}</code>
        
        <div style="margin-top:10px;"><strong>标准 XYZ 瓦片服务地址:</strong></div>
        <code style="background:#f1f5f9; padding:4px 8px; display:block; border-radius:4px; margin:4px 0; word-break:break-all;">${Q(l)}</code>
      </div>

      <div style="margin-top:20px;">
        <strong>Leaflet 加载接入示例:</strong>
        <div class="api-example">L.tileLayer('${Q(l)}', {
  minZoom: 3,
  maxZoom: 18,
  attribution: '私有地图服务中心'
}).addTo(map);</div>
      </div>

      <div style="margin-top:15px;">
        <strong>QGIS 接入说明:</strong>
        <div style="font-size:12px; color:#475569; margin-top:4px;">
          在 QGIS 的 Browser 面板中右键选择 <strong>XYZ Tiles</strong> -> <strong>New Connection</strong>，填入名称并将瓦片地址设置为上方“XYZ瓦片服务地址”即可。
        </div>
      </div>
    </div>
  `}function ai(e={},t=[],n=[],r=`proxy`){let i=[`fixed`,`pool`].includes(e.mode)?e.mode:`never`;return`
    <div class="form-grid">
      <div class="field-group">
        <label>代理模式</label>
        <select name="${r}_mode" data-proxy-mode-select>
          <option value="never" ${i===`never`?`selected`:``}>始终直连</option>
          <option value="fixed" ${i===`fixed`?`selected`:``}>固定代理出口</option>
          <option value="pool" ${i===`pool`?`selected`:``}>代理出口池</option>
        </select>
      </div>
      <div class="field-group" data-proxy-outbound-field style="display: ${i===`fixed`?`flex`:`none`};">
        <label>关联代理出口</label>
        <select name="${r}_outboundId">
          <option value="">请选择出口</option>
          ${t.map(t=>`<option value="${t.id}" ${e.outboundId===t.id?`selected`:``}>${Q(t.name)}</option>`).join(``)}
        </select>
      </div>
      <div class="field-group" data-proxy-pool-field style="display: ${i===`pool`?`flex`:`none`};">
        <label>关联代理池</label>
        <select name="${r}_poolId">
          <option value="">请选择代理池</option>
          ${n.map(t=>`<option value="${t.id}" ${e.poolId===t.id?`selected`:``}>${Q(t.name)}</option>`).join(``)}
        </select>
      </div>
    </div>
    <div class="checkbox-group">
      <input type="checkbox" id="${r}_fallback" name="${r}_fallbackToDirect" ${e.fallbackToDirect?`checked`:``}>
      <label for="${r}_fallback">代理连接失败时允许直连</label>
    </div>
  `}function oi(e,t){let n=Number.isFinite(Number(e))?Math.max(0,Number(e)):t;return{days:Math.floor(n/Nr),hours:Math.floor(n%Nr/Mr),minutes:Math.floor(n%Mr/jr)}}function si(e,t,n,r){let i=oi(n,r);return`
    <div class="field-group">
      <label>${t}</label>
      <div style="display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap:8px;">
        <input name="${e}_days" type="number" min="0" max="365" value="${i.days}" aria-label="${t}天数">
        <input name="${e}_hours" type="number" min="0" max="23" value="${i.hours}" aria-label="${t}小时数">
        <input name="${e}_minutes" type="number" min="0" max="59" value="${i.minutes}" aria-label="${t}分钟数">
      </div>
      <small style="color:#64748b;">天 / 小时 / 分钟</small>
    </div>
  `}function ci(e={},t=`cache`){return`
    <div class="checkbox-group">
      <input type="checkbox" id="${t}_enabled" name="${t}_enabled" ${e.enabled===!1?``:`checked`}>
      <label for="${t}_enabled">启用服务端缓存</label>
    </div>
    <div class="form-grid" style="margin-top:10px;">
      ${si(`${t}_ttl`,`缓存有效时间`,e.ttlMs,kr)}
      ${si(`${t}_staleTtl`,`软过期时间`,e.staleTtlMs,Ar)}
    </div>
  `}function li(e,t,n=`proxy`){return{mode:t.get(`${n}_mode`)||`never`,outboundId:t.get(`${n}_outboundId`)||``,poolId:t.get(`${n}_poolId`)||``,fallbackToDirect:!!e.elements[`${n}_fallbackToDirect`]?.checked}}function ui(e,t){let n=Math.max(0,parseInt(e.get(`${t}_days`)||`0`,10)||0),r=Math.max(0,parseInt(e.get(`${t}_hours`)||`0`,10)||0),i=Math.max(0,parseInt(e.get(`${t}_minutes`)||`0`,10)||0);return n*Nr+r*Mr+i*jr}function di(e,t,n=`cache`){return{enabled:!!e.elements[`${n}_enabled`]?.checked,ttlMs:ui(t,`${n}_ttl`),staleTtlMs:ui(t,`${n}_staleTtl`)}}function fi(e,t){return String(e.get(t)||``).split(`,`).map(e=>e.trim()).filter(Boolean)}function pi(e){return{template:String(e.get(`entry_template`)||``).trim(),styleJsonUrl:String(e.get(`entry_styleJsonUrl`)||``).trim(),tileJsonUrl:String(e.get(`entry_tileJsonUrl`)||``).trim(),pmtilesUrl:String(e.get(`entry_pmtilesUrl`)||``).trim(),glyphsUrl:String(e.get(`entry_glyphsUrl`)||``).trim(),spritesUrl:String(e.get(`entry_spritesUrl`)||``).trim()}}function mi(e,t){return{required:!!e.elements.secrets_required?.checked,keyPoolId:t.get(`secrets_keyPoolId`)||``,placement:t.get(`secrets_placement`)||`query`,paramName:t.get(`secrets_paramName`)||`key`}}function hi(e,t){return{engine:t.get(`rendering_engine`)||`leaflet`,clients:[e.elements.rendering_client_2d?.checked?`2d`:``,e.elements.rendering_client_3d?.checked?`3d`:``].filter(Boolean),fallbackRasterSourceId:t.get(`rendering_fallbackRasterSourceId`)||``}}function gi(e,t){return{attribution:t.get(`license_attribution`)||``,termsUrl:t.get(`license_termsUrl`)||``,officialStatus:t.get(`license_officialStatus`)||`official`,licenseType:t.get(`license_licenseType`)||`unknown`,cacheAllowedByLicense:!!e.elements.license_cacheAllowedByLicense?.checked,publicUseAllowed:!!e.elements.license_publicUseAllowed?.checked,chinaPublicUseReviewed:!!e.elements.license_chinaPublicUseReviewed?.checked,chinaPublicUseRisk:t.get(`license_chinaPublicUseRisk`)||``}}function _i(e,t){let n=Array.from(e.querySelectorAll(`[data-key-row]`)).map(e=>{let t=t=>e.querySelector(`[name="${t}"]`),n={id:t(`key_id`)?.value||``,alias:t(`key_alias`)?.value||``,enabled:!!t(`key_enabled`)?.checked,secretType:t(`key_secretType`)?.value||`api_key`,placement:t(`key_placement`)?.value||`query`,paramName:t(`key_paramName`)?.value||`key`,priority:parseInt(t(`key_priority`)?.value||`100`,10),weight:parseInt(t(`key_weight`)?.value||`1`,10),qpsLimit:parseInt(t(`key_qpsLimit`)?.value||`0`,10),dailyLimit:parseInt(t(`key_dailyLimit`)?.value||`0`,10),monthlyLimit:parseInt(t(`key_monthlyLimit`)?.value||`0`,10)},r=t(`key_secret`)?.value||``;return r&&(n.secret=r),n});return{id:t.get(`id`),name:t.get(`name`),vendor:t.get(`vendor`),enabled:!!e.elements.enabled?.checked,scope:t.get(`scope`)||`global`,strategy:t.get(`strategy`)||`round_robin`,cooldownMs:parseInt(t.get(`cooldownMs`)||`300000`,10),maxRetriesPerRequest:parseInt(t.get(`maxRetriesPerRequest`)||`2`,10),defaultSecretType:t.get(`defaultSecretType`)||`api_key`,defaultPlacement:t.get(`defaultPlacement`)||`query`,defaultParamName:t.get(`defaultParamName`)||`key`,credentialUrl:String(t.get(`credentialUrl`)||``).trim(),allowedPresetIds:fi(t,`allowedPresetIds`),allowedSourceIds:fi(t,`allowedSourceIds`),keys:n,description:t.get(`description`)||``}}function vi(e,t){if(!e.editingKeyPool||!t)return;let n=e.editingKeyPool.keys||[],r=new Map(n.filter(e=>e.id).map(e=>[e.id,e])),i=_i(t,new FormData(t));i.keys=i.keys.map((e,t)=>({...n[t]||{},...r.get(e.id)||{},...e})),e.editingKeyPool={...e.editingKeyPool,...i}}function yi(e={}){let t=e.entry||{};return`
    <fieldset class="form-card" style="margin-top:15px; padding:15px; background:white;">
      <legend style="padding:0 5px; font-weight:600;">上游入口配置</legend>
      <div class="form-grid single">
        <div class="field-group">
          <label>瓦片 / MVT URL 模板</label>
          <input name="entry_template" value="${Q(t.template||e.template||``)}" placeholder="https://example.com/{z}/{x}/{y}.png">
          <small style="color:#64748b;">适用于栅格、WMTS、ArcGIS、QuadKey、MVT 等模板类图源；支持 {s}、{x}、{y}、{z}、{scale}、{yTms}、{key}、{quadkey}。</small>
        </div>
      </div>
      <div class="form-grid">
        <div class="field-group">
          <label>Style JSON URL</label>
          <input name="entry_styleJsonUrl" value="${Q(t.styleJsonUrl||e.styleJsonUrl||``)}" placeholder="https://example.com/style.json?key={key}">
        </div>
        <div class="field-group">
          <label>TileJSON URL</label>
          <input name="entry_tileJsonUrl" value="${Q(t.tileJsonUrl||e.tileJsonUrl||``)}" placeholder="https://example.com/tilejson.json?key={key}">
        </div>
      </div>
      <div class="form-grid">
        <div class="field-group">
          <label>PMTiles URL</label>
          <input name="entry_pmtilesUrl" value="${Q(t.pmtilesUrl||e.pmtilesUrl||``)}" placeholder="https://example.com/base.pmtiles">
        </div>
        <div class="field-group">
          <label>Glyphs URL</label>
          <input name="entry_glyphsUrl" value="${Q(t.glyphsUrl||``)}" placeholder="https://example.com/fonts/{fontstack}/{range}.pbf">
        </div>
      </div>
      <div class="form-grid single">
        <div class="field-group">
          <label>Sprites URL 前缀</label>
          <input name="entry_spritesUrl" value="${Q(t.spritesUrl||``)}" placeholder="https://example.com/sprites/sprite">
        </div>
      </div>
    </fieldset>
  `}function bi(e={},t=[]){let n=e.secrets||{};return`
    <fieldset class="form-card" style="margin-top:15px; padding:15px; background:white;">
      <legend style="padding:0 5px; font-weight:600;">密钥策略</legend>
      <div class="checkbox-group" style="margin-top:0;">
        <input type="checkbox" id="secrets_required" name="secrets_required" ${n.required?`checked`:``}>
        <label for="secrets_required">该图源需要密钥池</label>
      </div>
      <div class="form-grid" style="margin-top:10px;">
        <div class="field-group">
          <label>关联密钥池</label>
          <select name="secrets_keyPoolId">
            <option value="">不关联密钥池</option>
            ${$r(t,n.keyPoolId||``)}
          </select>
        </div>
        <div class="field-group">
          <label>注入方式</label>
          <select name="secrets_placement">
            ${Wr(Lr,n.placement||`query`)}
          </select>
        </div>
      </div>
      <div class="form-grid single">
        <div class="field-group">
          <label>参数名 / Header 名</label>
          <input name="secrets_paramName" value="${Q(n.paramName||`key`)}" placeholder="key / access_token / tk / x-api-key">
        </div>
      </div>
    </fieldset>
  `}function xi(e={},t=[]){let n=e.rendering||{},r=n.clients||(qr(e.kind)?[`2d`]:[`2d`,`3d`]),i=t.filter(e=>!qr(e.kind)&&!Jr(e.kind));return`
    <fieldset class="form-card" style="margin-top:15px; padding:15px; background:white;">
      <legend style="padding:0 5px; font-weight:600;">渲染配置</legend>
      <div class="form-grid">
        <div class="field-group">
          <label>渲染引擎</label>
          <select name="rendering_engine">
            ${Wr(Br,n.engine||(qr(e.kind)?`maplibre`:`leaflet`))}
          </select>
        </div>
        <div class="field-group">
          <label>3D 降级栅格图源</label>
          <select name="rendering_fallbackRasterSourceId">
            <option value="">不配置</option>
            ${i.map(e=>`<option value="${Q(e.id)}" ${n.fallbackRasterSourceId===e.id?`selected`:``}>${Q(e.name)} (${Q(e.id)})</option>`).join(``)}
          </select>
        </div>
      </div>
      <div class="checkbox-group" style="margin-top:0;">
        <input type="checkbox" id="rendering_client_2d" name="rendering_client_2d" ${r.includes(`2d`)?`checked`:``}>
        <label for="rendering_client_2d">支持 2D 前台</label>
      </div>
      <div class="checkbox-group">
        <input type="checkbox" id="rendering_client_3d" name="rendering_client_3d" ${r.includes(`3d`)?`checked`:``}>
        <label for="rendering_client_3d">支持 3D 前台</label>
      </div>
    </fieldset>
  `}function Si(e={}){let t=e.license||{};return`
    <fieldset class="form-card" style="margin-top:15px; padding:15px; background:white;">
      <legend style="padding:0 5px; font-weight:600;">授权与合规</legend>
      <div class="form-grid">
        <div class="field-group">
          <label>版权声明</label>
          <input name="license_attribution" value="${Q(t.attribution||e.attribution||``)}">
        </div>
        <div class="field-group">
          <label>服务条款 URL</label>
          <input name="license_termsUrl" value="${Q(t.termsUrl||``)}">
        </div>
      </div>
      <div class="form-grid">
        <div class="field-group">
          <label>官方状态</label>
          <select name="license_officialStatus">
            ${Wr([[`official`,`官方`],[`unofficial`,`非官方`],[`community`,`社区`],[`internal`,`内部`]],t.officialStatus||`official`)}
          </select>
        </div>
        <div class="field-group">
          <label>授权类型</label>
          <select name="license_licenseType">
            ${Wr([[`free`,`免费`],[`api-key`,`API Key`],[`commercial`,`商业授权`],[`unknown`,`未知`]],t.licenseType||`unknown`)}
          </select>
        </div>
      </div>
      <div class="checkbox-group" style="margin-top:0;">
        <input type="checkbox" id="license_cacheAllowedByLicense" name="license_cacheAllowedByLicense" ${t.cacheAllowedByLicense===!1?``:`checked`}>
        <label for="license_cacheAllowedByLicense">授权允许服务端缓存</label>
      </div>
      <div class="checkbox-group">
        <input type="checkbox" id="license_publicUseAllowed" name="license_publicUseAllowed" ${t.publicUseAllowed?`checked`:``}>
        <label for="license_publicUseAllowed">授权允许公开对外服务</label>
      </div>
      <div class="checkbox-group">
        <input type="checkbox" id="license_chinaPublicUseReviewed" name="license_chinaPublicUseReviewed" ${t.chinaPublicUseReviewed?`checked`:``}>
        <label for="license_chinaPublicUseReviewed">已完成国内公开使用风险复核</label>
      </div>
      <div class="field-group" style="margin-top:10px;">
        <label>国内公开使用风险说明</label>
        <textarea name="license_chinaPublicUseRisk" rows="2">${Q(t.chinaPublicUseRisk||``)}</textarea>
      </div>
    </fieldset>
  `}function Ci(e={}){let t=Number(e.retina?.normalValue);return Pr[t]?String(t):`1`}function wi(e,t,n,r,i){let a=e!==!1,o=a?i:r;return`
    <button
      type="button"
      class="status-toggle ${a?`is-enabled`:`is-disabled`}"
      data-tile-sources-toggle-${t}="${Q(n)}"
      title="点击切换为${Q(o)}"
    >${Q(a?r:i)}</button>
  `}function Ti(e){let t=String(e||``).toUpperCase();return t===`HIT`?`<span class="badge-green">HIT</span>`:t===`MISS`?`<span class="badge-red">MISS</span>`:t===`BYPASS`?`<span class="badge-gray">BYPASS</span>`:t===`REVALIDATED`?`<span class="badge-blue">REVAL</span>`:t===`STALE`?`<span class="badge-blue">STALE</span>`:t===`ERROR`?`<span class="badge-red">ERROR</span>`:`<span class="badge-gray">${Q(t||`-`)}</span>`}function Ei(e){let t=Number(e.statusCode||0);return t>=200&&t<300?`<span class="badge-green">200 OK</span>`:`<span class="badge-red" title="${Q(e.errorMessage||``)}">${Q(e.statusCode||`-`)}</span>`}function Di(e){return e.proxyOutboundId?`<span class="badge-blue" title="池: ${Q(e.proxyPoolId||``)}">${Q(e.proxyOutboundId)}</span>`:e.proxyPoolId?`<span class="badge-blue">${Q(e.proxyPoolId)}</span>`:e.proxyConfigured?`<span class="badge-red" title="已配置代理，但本次未命中可用出口">代理未命中</span>`:`<span style="color:#94a3b8;">直连</span>`}async function Oi(e,t,n={}){let{tileSources:r=!1,sourcePresets:i=!1,keyPools:a=!1,mapLayers:o=!1,externalPublishes:s=!1,precacheCatalog:c=!0}=n,l=[],u=[];r&&(l.push(t.listTileSources()),u.push(t=>{e.tileSources=t})),i&&(l.push(t.listSourcePresets()),u.push(t=>{e.sourcePresets=t})),a&&(l.push(t.listKeyPools()),u.push(t=>{e.keyPools=t})),o&&(l.push(t.listMapLayers()),u.push(t=>{e.mapLayers=t})),s&&(l.push(t.listExternalPublishes()),u.push(t=>{e.externalPublishes=t})),c&&(l.push(t.precacheCatalog()),u.push(t=>{e.precacheCatalog=t})),(await Promise.all(l)).forEach((e,t)=>u[t](e))}function ki(e){e.tileSourcesSubTab=e.tileSourcesSubTab||`sources`;let t=[{id:`sources`,label:`图源`},{id:`presets`,label:`图源预设`},{id:`key-pools`,label:`密钥池`},{id:`layers`,label:`图层组合`},{id:`publishes`,label:`发布/API`},{id:`diagnostics`,label:`诊断日志`}],n=``;switch(e.tileSourcesSubTab){case`sources`:n=Ai(e);break;case`presets`:n=ji(e);break;case`key-pools`:n=Ni(e);break;case`layers`:n=Pi(e);break;case`publishes`:n=Fi(e);break;case`diagnostics`:n=Ii(e);break;default:n=`<p>未知子页面</p>`}return`
    <section class="admin-panel tile-sources-panel">


      <div class="subtab-header" role="tablist">
        ${t.map(t=>`
          <button class="subtab-btn ${e.tileSourcesSubTab===t.id?`is-active`:``}" 
                  type="button" role="tab" 
                  data-tile-sources-tab="${t.id}">
            ${Q(t.label)}
          </button>
        `).join(``)}
      </div>

      <div class="subtab-content">
        ${n}
      </div>
    </section>
  `}function Ai(e){let t=e.tileSources||[],n=e.editingTileSource;if(n){let r=!t.some(e=>e.id===n.id),i=e.proxyOutbounds||[],a=e.proxyPools||[],o=e.keyPools||[],s=Ci(n),c=n.category||`custom`,l=n.kind||`xyz-raster`;return`
      <div class="form-card">
        <h3>${r?`新增图源`:`编辑图源: ${Q(n.id)}`}</h3>
        <form data-tile-sources-form="source">
          <input type="hidden" name="isNew" value="${r}">
          <div class="form-grid">
            <div class="field-group">
              <label>图源唯一 ID</label>
              <input name="id" value="${Q(n.id||``)}" required ${r?``:`readonly`} placeholder="例如: custom-satellite">
            </div>
            <div class="field-group">
              <label>图源名称</label>
              <input name="name" value="${Q(n.name||``)}" required placeholder="例如: 自定义卫星">
            </div>
          </div>
          <div class="form-grid">
            <div class="field-group">
              <label>地图提供商</label>
              <input name="vendor" value="${Q(n.vendor||``)}" required placeholder="例如: amap, google, custom">
            </div>
            <div class="field-group">
              <label>图源分类</label>
              <select name="category">
                ${Gr(c,Ir)}
                ${Wr(Ir,c)}
              </select>
            </div>
          </div>
          <div class="form-grid">
            <div class="field-group">
              <label>图源类型</label>
              <select name="kind">
                ${Wr(Fr,l)}
              </select>
            </div>
            <div class="field-group">
              <label>适配器</label>
              <input name="adapter" value="${Q(n.adapter||(qr(l)?`maplibre-style`:`template`))}" placeholder="template / wmts-kvp / maplibre-style / pmtiles">
            </div>
          </div>
          <div class="form-grid">
            <div class="field-group">
              <label>来源预设 ID</label>
              <input name="presetId" value="${Q(n.presetId||``)}" placeholder="例如: preset:maptiler-streets-vector">
            </div>
            <div class="field-group">
              <label>矢量 Schema / 坐标系</label>
              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
                <input name="schema" value="${Q(n.schema||``)}" placeholder="openmaptiles">
                <input name="coordinateSystem" value="${Q(n.coordinateSystem||`EPSG:3857`)}" placeholder="EPSG:3857">
              </div>
            </div>
          </div>
          ${yi(n)}
          <div class="form-grid">
            <div class="field-group">
              <label>缩放范围 (最小 - 最大)</label>
              <div style="display:flex; gap:10px; align-items:center;">
                <input name="minZoom" type="number" value="${n.minZoom??3}" min="0" max="22" style="flex:1;">
                <span>至</span>
                <input name="maxZoom" type="number" value="${n.maxZoom??18}" min="0" max="22" style="flex:1;">
              </div>
            </div>
            <div class="field-group">
              <label>最大原生缩放</label>
              <input name="maxNativeZoom" type="number" value="${n.maxNativeZoom??18}" min="0" max="22">
            </div>
          </div>
          
          <div class="form-grid">
            <div class="field-group">
              <label>子域名组 (半角逗号分隔)</label>
              <input name="subdomains" value="${Q((n.subdomains||[]).join(`,`))}" placeholder="例如: 1,2,3,4">
            </div>
            <div class="field-group">
              <label>瓦片倍率</label>
              <select name="tileScale">
                <option value="1" ${s===`1`?`selected`:``}>1x（256px）</option>
                <option value="2" ${s===`2`?`selected`:``}>2x（请求 512px，网格 256px）</option>
                <option value="3" ${s===`3`?`selected`:``}>3x（请求 768px，网格 256px）</option>
              </select>
              <small style="color:#64748b;">瓦片网格固定 256px；高清请求通过 scale 控制。</small>
            </div>
          </div>

          <div class="form-grid">
            <div class="field-group">
              <label>标签 (半角逗号分隔)</label>
              <input name="tags" value="${Q((n.tags||[]).join(`,`))}" placeholder="例如: china, satellite">
            </div>
            <div class="field-group">
              <label>描述</label>
              <textarea name="description" rows="2">${Q(n.description||``)}</textarea>
            </div>
          </div>

          ${bi(n,o)}
          ${xi(n,t)}
          ${Si(n)}

          <fieldset class="form-card" style="margin-top:15px; padding:15px; background:white;">
            <legend style="padding:0 5px; font-weight:600;">缓存策略</legend>
            ${ci(n.cache,`cache`)}
          </fieldset>

          <fieldset class="form-card" style="margin-top:15px; padding:15px; background:white;">
            <legend style="padding:0 5px; font-weight:600;">代理策略</legend>
            ${ai(n.proxy,i,a,`proxy`)}
          </fieldset>

          <fieldset class="form-card" style="margin-top:15px; padding:15px; background:white;">
            <legend style="padding:0 5px; font-weight:600;">访问日志</legend>
            <div class="checkbox-group">
              <input type="checkbox" id="source_access_log_enabled" name="accessLog_enabled" ${n.accessLog?.enabled===!1?``:`checked`}>
              <label for="source_access_log_enabled">记录通过代理或发生错误的图源访问</label>
            </div>
            <div class="field-group" style="margin-top:10px;">
              <label>最大历史日志保留行数</label>
              <input name="accessLog_maxLogCount" type="number" min="0" max="10000" value="${n.accessLog?.maxLogCount??500}">
            </div>
          </fieldset>

          <fieldset class="form-card" style="margin-top:15px; padding:15px; background:white;">
            <legend style="padding:0 5px; font-weight:600;">权限控制</legend>
            <div class="checkbox-group">
              <input type="checkbox" id="perm_front" name="perm_frontendVisible" ${n.permissions?.frontendVisible===!1?``:`checked`}>
              <label for="perm_front">允许前台底图选择器显示</label>
            </div>
            <div class="checkbox-group">
              <input type="checkbox" id="perm_precache" name="perm_precacheAllowed" ${n.permissions?.precacheAllowed===!1?``:`checked`}>
              <label for="perm_precache">允许创建预缓存任务</label>
            </div>
            <div class="checkbox-group">
              <input type="checkbox" id="perm_external" name="perm_externalApiAllowed" ${n.permissions?.externalApiAllowed===!1?``:`checked`}>
              <label for="perm_external">允许作为外部 API 发布公开项</label>
            </div>
            <div class="checkbox-group">
              <input type="checkbox" id="perm_user_ref" name="perm_userReferenceAllowed" ${n.permissions?.userReferenceAllowed?`checked`:``}>
              <label for="perm_user_ref">允许用户自定义图层引用</label>
            </div>
          </fieldset>

          <fieldset class="form-card" style="margin-top:15px; padding:15px; background:white;">
            <legend style="padding:0 5px; font-weight:600;">使用范围</legend>
            <div class="field-group">
              <label>图源范围</label>
              <select name="visibility_scope">
                <option value="system" ${n.visibility?.scope===`external_only`?``:`selected`}>系统图源</option>
                <option value="external_only" ${n.visibility?.scope===`external_only`?`selected`:``}>仅对外 API 专用</option>
              </select>
            </div>
          </fieldset>

          <div class="checkbox-group" style="margin-top:20px;">
            <input type="checkbox" id="source_enabled" name="enabled" ${n.enabled===!1?``:`checked`}>
            <label for="source_enabled" style="font-weight:600; color:#1e293b;">启用该图源</label>
          </div>

          <div style="margin-top:25px; display:flex; gap:15px;">
            <button type="submit" class="admin-form-submit">保存配置</button>
            <button type="button" class="admin-form-cancel" data-tile-sources-cancel="source">取消</button>
          </div>
        </form>
      </div>
    `}return`
    <div class="admin-panel-head">
      <h3>系统图源列表</h3>
      <button type="button" data-tile-sources-add="source">+ 新建图源</button>
    </div>
    
    <table class="item-table">
      <thead>
        <tr>
          <th>ID / 图源名称</th>
          <th>厂商 / 类型</th>
          <th>主入口</th>
          <th>缩放级</th>
          <th>密钥池</th>
          <th>缓存状态</th>
          <th>代理策略</th>
          <th>前台可见</th>
          <th>状态</th>
          <th>测试诊断</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        ${t.map(t=>{let n=e[`test_source_${t.id}`]||``,r=Xr(t);return`
            <tr>
              <td>
                <strong>${Q(t.name)}</strong>
                <div style="color: #64748b; font-size:11px; margin-top:2px;">${Q(t.id)}</div>
              </td>
              <td>
                <span class="badge-gray">${Q(t.vendor)}</span>
                <span class="badge-gray" style="margin-left:4px;">${Q(t.category)}</span>
                <span class="badge-blue" style="margin-left:4px;">${Q(Kr(t.kind))}</span>
                <span class="badge-gray" style="margin-left:4px;">${Q(ri(t))}</span>
              </td>
              <td>
                <code style="display:block; max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${Q(r)}">${Q(r||`-`)}</code>
              </td>
              <td>${t.minZoom}-${t.maxZoom}</td>
              <td>
                ${t.secrets?.required?`<span class="badge-blue">需要 Key</span>`:`<span class="badge-gray">无需 Key</span>`}
                ${t.secrets?.keyPoolId?`<div style="margin-top:4px;"><span class="badge-gray">${Q(t.secrets.keyPoolId)}</span></div>`:``}
              </td>
              <td>
                ${t.cache?.enabled===!1?`<span class="badge-gray">绕过</span>`:`<span class="badge-green">启用</span>`}
              </td>
              <td>
                ${t.proxy?.mode===`never`?`<span class="badge-gray">直连</span>`:``}
                ${t.proxy?.mode===`fixed`?`<span class="badge-blue" title="出口: ${Q(t.proxy.outboundId)}">固定出口</span>`:``}
                ${t.proxy?.mode===`pool`?`<span class="badge-blue" title="池: ${Q(t.proxy.poolId)}">代理池</span>`:``}
              </td>
              <td>
                ${t.permissions?.frontendVisible===!1?`<span class="badge-red">隐藏</span>`:`<span class="badge-green">可见</span>`}
              </td>
              <td>
                ${wi(t.enabled,`source`,t.id,`启用中`,`已禁用`)}
              </td>
              <td>
                <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                  <button type="button" class="btn-link" data-tile-sources-test-source="${t.id}">测试</button>
                  ${n===`loading`?`<span class="test-status test-loading" style="margin-left: 0;">测试中...</span>`:``}
                  ${n&&n!==`loading`&&n.success?`<span class="test-status test-success" style="margin-left: 0;">通过 (${n.duration}ms)</span>`:``}
                  ${n&&n!==`loading`&&!n.success?`<span class="test-status test-fail" style="margin-left: 0;" title="${Q(Ur(n))}">失败</span>`:``}
                </div>
              </td>
              <td>
                <div class="flex-actions">
                  <button type="button" class="btn-link" data-tile-sources-edit-source="${t.id}">编辑</button>
                  <button type="button" class="btn-link btn-danger-link" data-tile-sources-delete-source="${t.id}">删除</button>
                </div>
              </td>
            </tr>
          `}).join(``)||`<tr><td colspan="11" style="text-align:center;">暂无图源配置</td></tr>`}
      </tbody>
    </table>
  `}function ji(e){let t=e.sourcePresets||[],n=e.keyPools||[],r=e.creatingSourceFromPreset;if(r){let e=t.find(e=>e.presetId===r.presetId)||r,i=ei(e,n),a=r.keyPoolId||i?.id||``,o=e.status===`ready`;return`
      <div class="form-card">
        <h3>基于预设创建图源: ${Q(e.name||e.presetId)}</h3>
        <form data-tile-sources-form="preset-source">
          <input type="hidden" name="presetId" value="${Q(e.presetId)}">
          <div class="form-grid">
            <div class="field-group">
              <label>新图源 ID</label>
              <input name="id" required value="${Q(r.id||String(e.presetId||``).replace(/^preset:/,``))}">
            </div>
            <div class="field-group">
              <label>图源名称</label>
              <input name="name" required value="${Q(r.name||e.name||``)}">
            </div>
          </div>
          <div class="form-grid">
            <div class="field-group">
              <label>预设类型</label>
              <input value="${Q(`${e.vendor||`custom`} / ${Kr(e.kind)}`)}" readonly>
            </div>
            <div class="field-group">
              <label>关联密钥池</label>
              <select name="keyPoolId">
                <option value="">${e.requiresKey?`稍后配置密钥池`:`无需密钥池`}</option>
                ${$r(n,a)}
              </select>
              ${i?`<p style="color:#64748b; font-size:12px; margin:6px 0 0;">已自动匹配：${Q(i.name)} ${ti(i)}</p>`:``}
            </div>
          </div>
          <div class="checkbox-group" style="margin-top:15px;">
            <input type="checkbox" id="preset_source_enabled" name="enabled" ${r.enabled&&o?`checked`:``} ${o?``:`disabled`}>
            <label for="preset_source_enabled" style="font-weight:600;">创建后立即启用</label>
          </div>
          ${o?``:`<p style="color:#64748b; font-size:12px; margin-top:8px;">该预设仍需适配器或仅供调研参考，只能先创建为禁用图源。</p>`}
          <fieldset class="form-card" style="margin-top:15px; padding:15px; background:white;">
            <legend style="padding:0 5px; font-weight:600;">默认权限</legend>
            <div class="checkbox-group" style="margin-top:0;">
              <input type="checkbox" id="preset_perm_front" name="perm_frontendVisible" ${r.permissions?.frontendVisible?`checked`:``}>
              <label for="preset_perm_front">允许前台底图选择器显示</label>
            </div>
            <div class="checkbox-group">
              <input type="checkbox" id="preset_perm_external" name="perm_externalApiAllowed" ${r.permissions?.externalApiAllowed?`checked`:``}>
              <label for="preset_perm_external">允许对外 API 发布</label>
            </div>
            <div class="checkbox-group">
              <input type="checkbox" id="preset_perm_user" name="perm_userReferenceAllowed" ${r.permissions?.userReferenceAllowed?`checked`:``}>
              <label for="preset_perm_user">允许用户自定义图层引用</label>
            </div>
          </fieldset>
          <div style="margin-top:25px; display:flex; gap:15px;">
            <button type="submit" class="admin-form-submit">创建图源</button>
            <button type="button" class="admin-form-cancel" data-tile-sources-cancel="preset-source">取消</button>
          </div>
        </form>
      </div>
    `}return`
    <div class="admin-panel-head">
      <h3>图源预设库</h3>
      <span style="color:#64748b; font-size:13px;">共 ${t.length} 个预设，创建后默认进入禁用态</span>
    </div>
    <table class="item-table">
      <thead>
        <tr>
          <th>预设名称 / ID</th>
          <th>厂商 / 类型</th>
          <th>Key</th>
          <th>状态</th>
          <th>授权提示</th>
          <th>入口摘要</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        ${t.map(e=>{let t=Xr(e),r=ei(e,n);return`
            <tr>
              <td>
                <strong>${Q(e.name)}</strong>
                <div style="color:#64748b; font-size:11px; margin-top:2px;">${Q(e.presetId)}</div>
              </td>
              <td>
                <span class="badge-gray">${Q(e.vendor)}</span>
                <span class="badge-blue" style="margin-left:4px;">${Q(Kr(e.kind))}</span>
                <span class="badge-gray" style="margin-left:4px;">${Q(e.category)}</span>
              </td>
              <td>
                ${e.requiresKey?`<span class="badge-blue">需要 Key</span>`:`<span class="badge-gray">无需 Key</span>`}
                ${(e.requiredSecretTypes||[]).map(e=>`<span class="badge-gray" style="margin-left:4px;">${Q(e)}</span>`).join(``)}
                ${r?`<div style="margin-top:4px;"><span class="badge-gray">${Q(r.name)}</span> ${ti(r)}</div>`:``}
              </td>
              <td>${Qr(e.status)}</td>
              <td>
                ${Zr(e.cacheAllowedByLicense!==!1,`可缓存`,`禁缓存`)}
                ${Zr(!!e.publicUseAllowed,`可公开`,`慎公开`)}
              </td>
              <td>
                <code style="display:block; max-width:320px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${Q(t)}">${Q(t||`-`)}</code>
              </td>
              <td>
                <button type="button" class="btn-link" data-tile-sources-create-from-preset="${Q(e.presetId)}">创建图源</button>
              </td>
            </tr>
          `}).join(``)||`<tr><td colspan="7" style="text-align:center; color:#64748b; padding:20px;">暂无预设图源</td></tr>`}
      </tbody>
    </table>
  `}function Mi(e,t=!1,n={}){return(e.keys||[]).map((r,i)=>{let a=n[`test_key_${e.id}_${r.id}`]||``,o=!r.hasSecret&&!r.maskedPreview,s=r.secretType||e.defaultSecretType||`api_key`,c=r.placement||e.defaultPlacement||`query`,l=r.paramName||e.defaultParamName||`key`;return`
      <div class="key-row" data-key-row="${i}">
        <div class="key-row-main">
          <label style="display:inline-flex; align-items:center; gap:6px; font-weight:500;">
            <input type="checkbox" name="key_enabled" ${r.enabled===!1?``:`checked`}>
            启用
          </label>
          <input name="key_id" required value="${Q(r.id||``)}" placeholder="key-a">
          <input name="key_alias" value="${Q(r.alias||``)}" placeholder="主 Key">
          <select name="key_secretType">
            ${Gr(s,[[`api_key`,`api_key`],[`token`,`token`],[`tk`,`tk`],[`ak`,`ak`],[`appid`,`appid`]])}
            ${Wr([[`api_key`,`api_key`],[`token`,`token`],[`tk`,`tk`],[`ak`,`ak`],[`appid`,`appid`]],s)}
          </select>
        </div>
        <div class="key-row-main">
          <input name="key_secret" type="password" autocomplete="new-password" ${o?`required`:``} placeholder="${r.hasSecret?`留空保留 ${r.maskedPreview||`****`}`:`输入明文 Key`}">
          <select name="key_placement">
            ${Wr(Lr,c)}
          </select>
          <input name="key_paramName" value="${Q(l)}" placeholder="key">
        </div>
        <div class="key-row-main">
          <input name="key_priority" type="number" min="0" max="10000" value="${r.priority??100}" aria-label="优先级">
          <input name="key_weight" type="number" min="1" max="1000" value="${r.weight??1}" aria-label="权重">
          <input name="key_qpsLimit" type="number" min="0" value="${r.qpsLimit??0}" aria-label="QPS 限制">
          <input name="key_dailyLimit" type="number" min="0" value="${r.dailyLimit??0}" aria-label="每日限制">
          <input name="key_monthlyLimit" type="number" min="0" value="${r.monthlyLimit??0}" aria-label="每月限制">
        </div>
        <div class="flex-actions">
          ${t&&r.id?`<button type="button" class="btn-link" data-tile-sources-test-key="${Q(e.id)}:${Q(r.id)}">测试 Key</button>`:``}
          <button type="button" class="btn-link btn-danger-link" data-tile-sources-remove-key="${i}">移除</button>
          ${a===`loading`?`<span class="test-status test-loading">测试中...</span>`:``}
          ${a&&a!==`loading`&&a.success?`<span class="test-status test-success">可用</span>`:``}
          ${a&&a!==`loading`&&!a.success?`<span class="test-status test-fail" title="${Q(Ur(a))}">不可用</span>`:``}
        </div>
      </div>
    `}).join(``)||`<p style="color:#64748b;">暂无 Key，请添加至少一个 Key。</p>`}function Ni(e){let t=e.keyPools||[],n=e.sourcePresets||[],r=e.tileSources||[],i=e.editingKeyPool;if(i){let a=!t.some(e=>e.id===i.id);return`
      <div class="form-card">
        <h3>${a?`创建密钥池`:`编辑密钥池: ${Q(i.id)}`}</h3>
        <form data-tile-sources-form="key-pool">
          <input type="hidden" name="isNew" value="${a}">
          <div class="form-grid">
            <div class="field-group">
              <label>密钥池 ID</label>
              <input name="id" required value="${Q(i.id||``)}" ${a?``:`readonly`} placeholder="maptiler-main">
            </div>
            <div class="field-group">
              <label>密钥池名称</label>
              <input name="name" required value="${Q(i.name||``)}" placeholder="MapTiler 主密钥池">
            </div>
          </div>
          <div class="form-grid">
            <div class="field-group">
              <label>厂商</label>
              <input name="vendor" value="${Q(i.vendor||`custom`)}">
            </div>
            <div class="field-group">
              <label>作用域</label>
              <select name="scope">
                ${Wr(zr,i.scope||`global`)}
              </select>
            </div>
          </div>
          <div class="form-grid">
            <div class="field-group">
              <label>选择策略</label>
              <select name="strategy">
                ${Wr(Rr,i.strategy||`round_robin`)}
              </select>
            </div>
            <div class="field-group">
              <label>失败冷却 / 单请求重试</label>
              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
                <input name="cooldownMs" type="number" min="0" max="3600000" value="${i.cooldownMs??3e5}" aria-label="失败冷却毫秒">
                <input name="maxRetriesPerRequest" type="number" min="1" max="10" value="${i.maxRetriesPerRequest??2}" aria-label="单请求最大换 Key 次数">
              </div>
            </div>
          </div>
          <div class="form-grid">
            <div class="field-group">
              <label>默认 Key 类型</label>
              <select name="defaultSecretType">
                ${Gr(i.defaultSecretType||`api_key`,[[`api_key`,`api_key`],[`token`,`token`],[`tk`,`tk`],[`ak`,`ak`],[`appid`,`appid`]])}
                ${Wr([[`api_key`,`api_key`],[`token`,`token`],[`tk`,`tk`],[`ak`,`ak`],[`appid`,`appid`]],i.defaultSecretType||`api_key`)}
              </select>
            </div>
            <div class="field-group">
              <label>默认注入方式 / 参数名</label>
              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
                <select name="defaultPlacement">
                  ${Wr(Lr,i.defaultPlacement||`query`)}
                </select>
                <input name="defaultParamName" value="${Q(i.defaultParamName||`key`)}" placeholder="key / tk / ak / access_token">
              </div>
            </div>
          </div>
          <div class="form-grid">
            <div class="field-group">
              <label>允许的预设 ID (半角逗号分隔)</label>
              <input name="allowedPresetIds" value="${Q((i.allowedPresetIds||[]).join(`,`))}" list="source-preset-id-list">
              <datalist id="source-preset-id-list">
                ${n.map(e=>`<option value="${Q(e.presetId)}"></option>`).join(``)}
              </datalist>
            </div>
            <div class="field-group">
              <label>允许的图源 ID (半角逗号分隔)</label>
              <input name="allowedSourceIds" value="${Q((i.allowedSourceIds||[]).join(`,`))}" list="source-id-list">
              <datalist id="source-id-list">
                ${r.map(e=>`<option value="${Q(e.id)}"></option>`).join(``)}
              </datalist>
            </div>
          </div>
          <div class="field-group">
            <label>官方申请 / 控制台入口</label>
            <input name="credentialUrl" type="url" value="${Q(i.credentialUrl||``)}" placeholder="https://provider.example.com/console">
          </div>
          <div class="field-group">
            <label>描述</label>
            <textarea name="description" rows="2">${Q(i.description||``)}</textarea>
          </div>
          <div class="checkbox-group">
            <input type="checkbox" id="key_pool_enabled" name="enabled" ${i.enabled===!1?``:`checked`}>
            <label for="key_pool_enabled" style="font-weight:600;">启用该密钥池</label>
          </div>

          <fieldset class="form-card" style="margin-top:15px; padding:15px; background:white;">
            <legend style="padding:0 5px; font-weight:600;">密钥列表</legend>
            <div class="key-rows">
              ${Mi(i,!a,e)}
            </div>
            <button type="button" class="btn-link" data-tile-sources-add-key style="margin-top:10px;">+ 添加 Key</button>
          </fieldset>

          <div style="margin-top:25px; display:flex; gap:15px;">
            <button type="submit" class="admin-form-submit">保存密钥池</button>
            <button type="button" class="admin-form-cancel" data-tile-sources-cancel="key-pool">取消</button>
          </div>
        </form>
      </div>
    `}return`
    <div class="admin-panel-head">
      <h3>密钥池管理</h3>
      <button type="button" data-tile-sources-add="key-pool">+ 新建密钥池</button>
    </div>
    <table class="item-table">
      <thead>
        <tr>
          <th>ID / 名称</th>
          <th>厂商 / 策略</th>
          <th>Key 数量</th>
          <th>引用限制</th>
          <th>连通测试</th>
          <th>状态</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        ${t.map(t=>{let n=e[`test_key_pool_${t.id}`]||``,r=(t.keys||[]).filter(e=>e.enabled!==!1).length;return`
            <tr>
              <td>
                <strong>${Q(t.name)}</strong>
                <div style="color:#64748b; font-size:11px; margin-top:2px;">${Q(t.id)}</div>
                ${t.credentialUrl?`<div style="margin-top:4px;">${ti(t,`申请 / 管理 Key`)}</div>`:``}
              </td>
              <td>
                <span class="badge-gray">${Q(t.vendor)}</span>
                <span class="badge-blue" style="margin-left:4px;">${Q(Rr.find(([e])=>e===t.strategy)?.[1]||t.strategy)}</span>
                <div style="color:#64748b; font-size:11px; margin-top:4px;">${Q(t.defaultSecretType||`api_key`)} / ${Q(t.defaultParamName||`key`)}</div>
              </td>
              <td>${r}/${(t.keys||[]).length} 可用</td>
              <td>
                <span class="badge-gray">预设 ${(t.allowedPresetIds||[]).length}</span>
                <span class="badge-gray" style="margin-left:4px;">图源 ${(t.allowedSourceIds||[]).length}</span>
              </td>
              <td>
                <button type="button" class="btn-link" data-tile-sources-test-key-pool="${t.id}">测试</button>
                ${n===`loading`?`<span class="test-status test-loading">测试中...</span>`:``}
                ${n&&n!==`loading`&&n.success?`<span class="test-status test-success">可用 ${n.enabledKeyCount}/${n.totalKeyCount}</span>`:``}
                ${n&&n!==`loading`&&!n.success?`<span class="test-status test-fail" title="${Q(Ur(n))}">失败</span>`:``}
              </td>
              <td>${wi(t.enabled,`key-pool`,t.id,`启用中`,`已禁用`)}</td>
              <td>
                <div class="flex-actions">
                  <button type="button" class="btn-link" data-tile-sources-edit-key-pool="${t.id}">编辑</button>
                  <button type="button" class="btn-link btn-danger-link" data-tile-sources-delete-key-pool="${t.id}">删除</button>
                </div>
              </td>
            </tr>
          `}).join(``)||`<tr><td colspan="7" style="text-align:center; color:#64748b; padding:20px;">暂无密钥池</td></tr>`}
      </tbody>
    </table>
  `}function Pi(e){let t=e.mapLayers||[],n=e.editingMapLayer;if(n){let r=!t.some(e=>e.id===n.id),i=e.tileSources||[],a=n.items||[{sourceId:``,opacity:1,zIndex:0}];return`
      <div class="form-card">
        <h3>${r?`创建组合图层`:`编辑组合图层: ${Q(n.id)}`}</h3>
        <form data-tile-sources-form="layer">
          <input type="hidden" name="isNew" value="${r}">
          <div class="form-grid">
            <div class="field-group">
              <label>图层唯一 ID</label>
              <input name="id" value="${Q(n.id||``)}" required ${r?``:`readonly`} placeholder="例如: hybrid-sat">
            </div>
            <div class="field-group">
              <label>图层显示名称</label>
              <input name="name" value="${Q(n.name||``)}" required placeholder="例如: 高德/卫星">
            </div>
          </div>
          
          <div class="form-grid">
            <div class="field-group">
              <label>图层展示类型</label>
              <select name="type">
                <option value="base" ${n.type===`base`?`selected`:``}>底图图层</option>
                <option value="overlay" ${n.type===`overlay`?`selected`:``}>叠加图层</option>
              </select>
            </div>
            <div class="field-group">
              <label>图层排序权重</label>
              <input name="sortOrder" type="number" value="${n.sortOrder??10}">
            </div>
          </div>

          <div class="form-grid">
            <div class="field-group">
              <label>缩放范围 (最小 - 最大)</label>
              <div style="display:flex; gap:10px; align-items:center;">
                <input name="minZoom" type="number" value="${n.minZoom??3}" min="0" max="22" style="flex:1;">
                <span>至</span>
                <input name="maxZoom" type="number" value="${n.maxZoom??18}" min="0" max="22" style="flex:1;">
              </div>
            </div>
            <div class="field-group">
              <label>适用客户端</label>
              <div style="display:flex; gap:20px; align-items:center; margin-top:10px;">
                <label style="display:inline-flex; align-items:center; gap:6px; font-weight:normal;">
                  <input type="checkbox" name="client_2d" value="2d" ${(n.clients||[`2d`,`3d`]).includes(`2d`)?`checked`:``}> 2D 地图
                </label>
                <label style="display:inline-flex; align-items:center; gap:6px; font-weight:normal;">
                  <input type="checkbox" name="client_3d" value="3d" ${(n.clients||[`2d`,`3d`]).includes(`3d`)?`checked`:``}> 3D 地图
                </label>
              </div>
            </div>
          </div>

          <div class="form-grid single">
            <div class="field-group">
              <label>图层描述</label>
              <input name="description" value="${Q(n.description||``)}" placeholder="可描述图层构成">
            </div>
          </div>

          <div class="field-group" style="margin-top:15px;">
            <label style="font-weight:600; display:flex; justify-content:space-between; align-items:center;">
              <span>包含图源组合 (从下往上叠加)</span>
              <button type="button" class="btn-link" data-tile-sources-add-layer-item>+ 添加图源</button>
            </label>
            <div class="layer-items-list" data-tile-sources-items-container>
              ${a.map((e,t)=>`
                <div class="layer-item-row" data-layer-item-index="${t}">
                  <span style="font-weight:bold; color:#64748b; font-size:11px; width:20px;">#${t+1}</span>
                  <select name="item_sourceId" required>
                    <option value="">请选择系统图源</option>
                    ${i.map(t=>`<option value="${t.id}" ${e.sourceId===t.id?`selected`:``}>${Q(t.name)} (${t.id} / ${Kr(t.kind)})</option>`).join(``)}
                  </select>
                  <div style="display:flex; align-items:center; gap:4px;">
                    <span style="font-size:12px; color:#475569;">不透明度:</span>
                    <input name="item_opacity" type="number" step="0.1" min="0" max="1" value="${e.opacity??1}" style="width:60px;">
                  </div>
                  <div class="flex-actions" style="margin-left:auto;">
                    <button type="button" class="btn-link" data-tile-sources-move-up="${t}">↑</button>
                    <button type="button" class="btn-link" data-tile-sources-move-down="${t}">↓</button>
                    <button type="button" class="btn-link btn-danger-link" data-tile-sources-remove-layer-item="${t}">移除</button>
                  </div>
                </div>
              `).join(``)}
            </div>
          </div>

          <div class="checkbox-group" style="margin-top:15px;">
            <input type="checkbox" id="layer_visible" name="frontendVisible" ${n.frontendVisible===!1?``:`checked`}>
            <label for="layer_visible">前台地图可见 (可见性)</label>
          </div>
          <div class="checkbox-group">
            <input type="checkbox" id="layer_enabled" name="enabled" ${n.enabled===!1?``:`checked`}>
            <label for="layer_enabled" style="font-weight:600;">启用该图层组合</label>
          </div>

          <div style="margin-top:25px; display:flex; gap:15px;">
            <button type="submit" class="admin-form-submit">保存配置</button>
            <button type="button" class="admin-form-cancel" data-tile-sources-cancel="layer">取消</button>
          </div>
        </form>
      </div>
    `}return`
    <div class="admin-panel-head">
      <h3>组合图层配置</h3>
      <button type="button" data-tile-sources-add="layer">+ 新增图层配置</button>
    </div>
    
    <table class="item-table">
      <thead>
        <tr>
          <th>ID / 图层名称</th>
          <th>图层类型</th>
          <th>包含子图源 (透明度)</th>
          <th>缩放级</th>
          <th>客户端</th>
          <th>状态</th>
          <th>默认底图</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        ${t.map(t=>`
          <tr>
            <td>
              <strong>${Q(t.name)}</strong>
              <div style="color: #64748b; font-size:11px; margin-top:2px;">${Q(t.id)}</div>
            </td>
            <td>
              <span class="badge-gray">${t.type===`base`?`基础底图`:`叠加图层`}</span>
            </td>
            <td>
              <div style="display:flex; flex-direction:column; gap:4px;">
                ${(t.items||[]).map((t,n)=>{let r=(e.tileSources||[]).find(e=>e.id===t.sourceId),i=r?r.name:t.sourceId;return`<div style="font-size:12px;">#${n+1} ${Q(i)} (${t.opacity??1})</div>`}).join(``)}
              </div>
            </td>
            <td>${t.minZoom}-${t.maxZoom}</td>
            <td>
              ${(t.clients||[]).map(e=>`<span class="badge-blue">${e.toUpperCase()}</span>`).join(` `)}
            </td>
            <td>
              ${wi(t.enabled,`layer`,t.id,`启用中`,`已禁用`)}
            </td>
            <td>
              ${t.default?`<span class="badge-green" style="font-weight:bold;">默认</span>`:`<button type="button" class="btn-link" data-tile-sources-set-default="${t.id}">设为默认</button>`}
            </td>
            <td>
              <div class="flex-actions">
                <button type="button" class="btn-link" data-tile-sources-edit-layer="${t.id}">编辑</button>
                <button type="button" class="btn-link btn-danger-link" data-tile-sources-delete-layer="${t.id}">删除</button>
              </div>
            </td>
          </tr>
        `).join(``)||`<tr><td colspan="8" style="text-align:center;">暂无图层配置</td></tr>`}
      </tbody>
    </table>
  `}function Fi(e){let t=e.externalPublishes||[],n=e.editingExternalPublish,r=e.selectedPublishId||t[0]?.id||``;if(n){let r=!t.some(e=>e.id===n.id),i=e.tileSources||[],a=i.filter(e=>e.visibility?.scope!==`external_only`&&e.permissions?.externalApiAllowed!==!1),o=i.filter(e=>e.visibility?.scope===`external_only`),s=e.mapLayers||[],c=e.proxyOutbounds||[],l=e.proxyPools||[],u=n.targetType||`source`,d=u===`layer`?s.map(e=>`<option value="${e.id}" ${n.targetId===e.id?`selected`:``}>${Q(e.name)} (${e.id})</option>`).join(``):u===`dedicated_source`?o.map(e=>`<option value="${e.id}" ${n.targetId===e.id?`selected`:``}>${Q(e.name)} (${e.id} / ${Kr(e.kind)})</option>`).join(``):a.map(e=>`<option value="${e.id}" ${n.targetId===e.id?`selected`:``}>${Q(e.name)} (${e.id} / ${Kr(e.kind)})</option>`).join(``),f=n.overrides?.proxy||null,p=n.overrides?.cache||null;return`
      <div class="form-card">
        <h3>${r?`创建公开对外发布项`:`编辑发布项: ${Q(n.id)}`}</h3>
        <form data-tile-sources-form="publish">
          <input type="hidden" name="isNew" value="${r}">
          <div class="form-grid">
            <div class="field-group">
              <label>发布项 ID</label>
              <input name="id" value="${Q(n.id||``)}" required ${r?``:`readonly`} placeholder="例如: amap-sat-public">
            </div>
            <div class="field-group">
              <label>发布项名称</label>
              <input name="name" value="${Q(n.name||``)}" required placeholder="例如: 高德卫星图源对外公开服务">
            </div>
          </div>
          <div class="form-grid">
            <div class="field-group">
              <label>发布对象类型</label>
              <select name="targetType" data-publish-target-type>
                <option value="source" ${u===`source`?`selected`:``}>发布系统图源</option>
                <option value="dedicated_source" ${u===`dedicated_source`?`selected`:``}>发布专用图源</option>
                <option value="layer" ${u===`layer`?`selected`:``}>发布组合图层</option>
              </select>
            </div>
            <div class="field-group">
              <label>选择关联对象</label>
              <select name="targetId" required>
                <option value="">请选择${Q(ni(u))}</option>
                ${d}
              </select>
            </div>
          </div>
          <div class="form-grid">
            <div class="field-group">
              <label>访问路径标识</label>
              <input name="pathSlug" value="${Q(n.pathSlug||``)}" required placeholder="例如: satellite-api">
            </div>
            <div class="field-group">
              <label>Token 鉴权模式</label>
              <select name="auth_mode">
                <option value="none" ${n.auth?.mode===`none`?`selected`:``}>公开无限制</option>
                <option value="token" ${n.auth?.mode===`token`?`selected`:``}>需要验证鉴权</option>
              </select>
            </div>
          </div>

          <fieldset class="form-card" style="margin-top:15px; padding:15px; background:white;">
            <legend style="padding:0 5px; font-weight:600;">流控限制 & 日志限制</legend>
            <div class="checkbox-group">
              <input type="checkbox" id="pub_ratelimit" name="rateLimit_enabled" ${n.rateLimit?.enabled?`checked`:``}>
              <label for="pub_ratelimit">启用访问限流</label>
            </div>
            <div class="field-group" style="margin-top:10px;">
              <label>每分钟最大请求量</label>
              <input name="rateLimit_maxRequestsPerMinute" type="number" value="${n.rateLimit?.maxRequestsPerMinute??600}">
            </div>
            <hr style="margin:15px 0; border:none; border-top:1px solid #e2e8f0;">
            <div class="checkbox-group">
              <input type="checkbox" id="pub_log" name="log_enabled" ${n.log?.enabled===!1?``:`checked`}>
              <label for="pub_log">启用访问日志统计</label>
            </div>
            <div class="field-group" style="margin-top:10px;">
              <label>最大历史日志保留行数</label>
              <input name="log_maxLogCount" type="number" value="${n.log?.maxLogCount??500}">
            </div>
          </fieldset>

          <fieldset class="form-card" style="margin-top:15px; padding:15px; background:white;">
            <legend style="padding:0 5px; font-weight:600;">发布项代理覆盖</legend>
            <div class="checkbox-group">
              <input type="checkbox" id="pub_proxy_override" name="proxy_override_enabled" ${f?`checked`:``}>
              <label for="pub_proxy_override">覆盖目标图源代理策略</label>
            </div>
            ${ai(f||{mode:`never`},c,l,`publish_proxy`)}
          </fieldset>

          <fieldset class="form-card" style="margin-top:15px; padding:15px; background:white;">
            <legend style="padding:0 5px; font-weight:600;">发布项缓存覆盖</legend>
            <div class="checkbox-group">
              <input type="checkbox" id="pub_cache_override" name="cache_override_enabled" ${p?`checked`:``}>
              <label for="pub_cache_override">覆盖目标图源缓存策略</label>
            </div>
            ${ci(p||{enabled:!0},`publish_cache`)}
          </fieldset>

          <div class="checkbox-group" style="margin-top:20px;">
            <input type="checkbox" id="pub_enabled" name="enabled" ${n.enabled===!1?``:`checked`}>
            <label for="pub_enabled" style="font-weight:600;">启用该对外服务发布项</label>
          </div>

          <div style="margin-top:25px; display:flex; gap:15px;">
            <button type="submit" class="admin-form-submit">保存发布</button>
            <button type="button" class="admin-form-cancel" data-tile-sources-cancel="publish">取消</button>
          </div>
        </form>
      </div>
    `}let i=e.lastGeneratedToken?`<div class="admin-token-notice">
        <span><strong>已成功重置 Token！您的明文 Token 是：</strong> <code>${Q(e.lastGeneratedToken)}</code> <br><small>请立即复制，刷新或离开本页后此明文 Token 将不再出现！</small></span>
        <button type="button" class="admin-token-notice-close" data-tile-sources-close-token-notice aria-label="关闭 Token 提示">×</button>
       </div>`:``,a=t.find(e=>e.id===r),o=``;return a&&(o=ii(a,e)),`
    ${i}
    
    <div class="admin-panel-head">
      <h3>对外发布项管理</h3>
      <button type="button" data-tile-sources-add="publish">+ 创建对外发布</button>
    </div>
    
    <table class="item-table">
      <thead>
        <tr>
          <th style="white-space: nowrap;">名称 / 标识 ID</th>
          <th style="white-space: nowrap;">目标类型</th>
          <th style="white-space: nowrap;">路径标识</th>
          <th style="white-space: nowrap;">鉴权方式</th>
          <th style="white-space: nowrap;">限流控制</th>
          <th style="white-space: nowrap;">连通测试</th>
          <th style="white-space: nowrap;">状态</th>
          <th style="white-space: nowrap;">管理操作</th>
        </tr>
      </thead>
      <tbody>
        ${t.map(t=>{let n=e[`test_publish_${t.id}`]||``;return`
            <tr style="background: ${t.id===r?`#f0fdfa`:`transparent`}; cursor:pointer;" data-tile-sources-select-publish="${t.id}">
              <td style="white-space: nowrap;">
                <strong style="display:inline-block; max-width:180px; overflow:hidden; text-overflow:ellipsis; vertical-align:middle;" title="${Q(t.name)}">${Q(t.name)}</strong>
                <div style="color: #64748b; font-size:11px; margin-top:2px;">${Q(t.id)}</div>
              </td>
              <td style="white-space: nowrap;"><span class="badge-gray">${Q(ni(t.targetType))}</span></td>
              <td style="white-space: nowrap;"><code style="background:#f1f5f9; padding:2px 6px; border-radius:4px; font-size:12px;">${Q(t.pathSlug)}</code></td>
              <td style="white-space: nowrap;">
                ${t.auth?.mode===`token`?`<span class="badge-blue" title="Token预览: ${Q(t.auth.tokenPreview||``)}">Token鉴权</span>`:`<span class="badge-gray">完全公开</span>`}
              </td>
              <td style="white-space: nowrap;">
                ${t.rateLimit?.enabled?`<span class="badge-green">${t.rateLimit.maxRequestsPerMinute} 请求/分</span>`:`<span class="badge-gray">无限制</span>`}
              </td>
              <td>
                <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                  <button type="button" class="btn-link" data-tile-sources-test-publish="${t.id}">测试</button>
                  ${n===`loading`?`<span class="test-status test-loading" style="margin-left: 0;">测试中...</span>`:``}
                  ${n&&n!==`loading`&&n.success?`<span class="test-status test-success" style="margin-left: 0;">成功 (${n.duration}ms)</span>`:``}
                  ${n&&n!==`loading`&&!n.success?`<span class="test-status test-fail" style="margin-left: 0;" title="${Q(Ur(n))}">失败</span>`:``}
                </div>
              </td>
              <td style="white-space: nowrap;">
                ${wi(t.enabled,`publish`,t.id,`已发布`,`已禁用`)}
              </td>
              <td style="white-space: nowrap;">
                <div class="flex-actions" style="flex-wrap: nowrap;">
                  <button type="button" class="btn-link" data-tile-sources-edit-publish="${t.id}">编辑</button>
                  ${t.auth?.mode===`token`?`<button type="button" class="btn-link" data-tile-sources-reset-token="${t.id}">重置</button>`:``}
                  <button type="button" class="btn-link btn-danger-link" data-tile-sources-delete-publish="${t.id}">注销</button>
                </div>
              </td>
            </tr>
          `}).join(``)||`<tr><td colspan="8" style="text-align:center;">暂无对外发布项</td></tr>`}
      </tbody>
    </table>

    ${o}
  `}function Ii(e){e.diagnosticsLogType=e.diagnosticsLogType||`source`;let t=e.diagnosticsPublishId||``,n=e.diagnosticsSourceId||``,r=e.externalPublishes||[],i=e.tileSources||[],a=e.diagnosticsLogType===`source`,o=a?e.sourceAccessLogs||[]:e.diagnosticLogs||[],s=a?e.sourceAccessLogsError||``:e.diagnosticLogsError||``;return`
    <div class="admin-panel-head">
      <h3>运行诊断日志</h3>
      <div style="display:flex; gap:10px; align-items:center;">
        <div class="segmented-control">
          <button type="button" class="${a?`is-active`:``}" data-tile-sources-diagnostics-type="source">图源访问</button>
          <button type="button" class="${a?``:`is-active`}" data-tile-sources-diagnostics-type="external">对外 API</button>
        </div>
        ${a?`
            <span style="font-size:13px; color:#475569;">筛选图源:</span>
            <select data-tile-sources-source-diagnostic-filter style="padding:6px 10px; border-radius:4px; border:1px solid #cbd5e1; font-size:12px;">
              <option value="">查看所有图源</option>
              ${i.map(e=>`<option value="${e.id}" ${e.id===n?`selected`:``}>${Q(e.name)}</option>`).join(``)}
            </select>
          `:`
            <span style="font-size:13px; color:#475569;">筛选发布项:</span>
            <select data-tile-sources-diagnostic-filter style="padding:6px 10px; border-radius:4px; border:1px solid #cbd5e1; font-size:12px;">
              <option value="">查看所有日志</option>
              ${r.map(e=>`<option value="${e.id}" ${e.id===t?`selected`:``}>${Q(e.name)}</option>`).join(``)}
            </select>
          `}
        <button type="button" data-tile-sources-refresh-logs>刷新日志</button>
      </div>
    </div>

    <p style="margin: -4px 0 12px; color:#64748b; font-size:13px;">
      ${a?`图源访问日志独立记录通过代理或发生错误的图源请求，保留行数由图源配置单独控制。`:`对外 API 日志仅记录发布项访问，保留行数由发布项的日志配置控制。`}
    </p>

    <table class="item-table log-table">
      <thead>
        <tr>
          <th>时间</th>
          <th>${a?`图源 ID`:`发布项 ID`}</th>
          <th>关联图源</th>
          <th>客户端 IP</th>
          <th>坐标 (Z/X/Y)</th>
          <th>代理网关</th>
          <th>耗时</th>
          <th>缓存</th>
          <th>状态</th>
        </tr>
      </thead>
      <tbody>
        ${s?`<tr><td colspan="9" style="text-align:center; color:#b91c1c; padding:20px;">${Q(s)}</td></tr>`:o.map(e=>`
          <tr>
            <td style="color:#64748b;">${new Date(e.timestamp).toLocaleString()}</td>
            <td><strong>${Q(a?e.sourceId||`-`:e.publishId||`-`)}</strong></td>
            <td><span class="badge-gray">${Q(e.sourceId||`-`)}</span></td>
            <td><code>${Q(e.clientIp)}</code></td>
            <td><code>${Q(e.coordinates)}</code></td>
            <td>${Di(e)}</td>
            <td>${Q(e.duration??0)}ms</td>
            <td>${Ti(e.cacheStatus)}</td>
            <td>${Ei(e)}</td>
          </tr>
        `).join(``)||`<tr><td colspan="9" style="text-align:center; color:#64748b; padding:20px;">${a?`暂无图源访问日志`:`暂无相关的对外访问日志`}</td></tr>`}
      </tbody>
    </table>
  `}async function Li(e,t){e.tileSourcesSubTab===`diagnostics`&&await Ri(e,t)}async function Ri(e,t){if(e.diagnosticsLogType=e.diagnosticsLogType||`source`,e.diagnosticsLogType===`source`){await Bi(e,t);return}await zi(e,t)}async function zi(e,t){e.loading=!0;try{let n=e.diagnosticsPublishId||``;e.diagnosticLogs=await t.listExternalPublishLogs(n),e.diagnosticLogsError=``}catch(t){e.diagnosticLogs=[],e.diagnosticLogsError=t.message}finally{e.loading=!1}}async function Bi(e,t){e.loading=!0;try{let n=e.diagnosticsSourceId||``;e.sourceAccessLogs=await t.listSourceAccessLogs(n),e.sourceAccessLogsError=``}catch(t){e.sourceAccessLogs=[],e.sourceAccessLogsError=t.message}finally{e.loading=!1}}async function Vi(e){let{event:t,state:n,api:r,renderDashboard:i,showConfirm:a,setNotice:o}=e,s=t.target.closest(`[data-tile-sources-tab]`);if(s)return n.tileSourcesSubTab=s.getAttribute(`data-tile-sources-tab`),n.editingTileSource=null,n.editingMapLayer=null,n.editingProxyOutbound=null,n.editingProxyPool=null,n.editingExternalPublish=null,n.editingKeyPool=null,n.creatingSourceFromPreset=null,n.tileSourcesSubTab===`diagnostics`&&await Ri(n,r),i(),!0;if(t.target.closest(`[data-tile-sources-close-token-notice]`))return n.lastGeneratedToken=null,i(),!0;if(t.target.closest(`[data-tile-sources-refresh-logs]`))return await Ri(n,r),i(),!0;let c=t.target.closest(`[data-tile-sources-diagnostics-type]`);if(c)return n.diagnosticsLogType=c.getAttribute(`data-tile-sources-diagnostics-type`),await Ri(n,r),i(),!0;let l=t.target.closest(`[data-tile-sources-select-publish]`);if(l&&!t.target.closest(`button`))return n.selectedPublishId=l.getAttribute(`data-tile-sources-select-publish`),i(),!0;if(t.target.closest(`[data-tile-sources-add="source"]`))return n.editingTileSource={id:``,name:``,vendor:``,category:`custom`,kind:`xyz-raster`,adapter:`template`,presetId:``,entry:{template:``,styleJsonUrl:``,tileJsonUrl:``,pmtilesUrl:``,glyphsUrl:``,spritesUrl:``},minZoom:3,maxZoom:18,maxNativeZoom:18,tileSize:256,retina:{mode:`fixed`,param:`scale`,normalValue:`1`,retinaValue:`1`},subdomains:[],secrets:{required:!1,keyPoolId:``,placement:`query`,paramName:`key`},rendering:{engine:`leaflet`,clients:[`2d`,`3d`],fallbackRasterSourceId:``},cache:{enabled:!0,ttlMs:216e5,staleTtlMs:2592e6},proxy:{mode:`never`,fallbackToDirect:!1},accessLog:{enabled:!0,maxLogCount:500},permissions:{frontendVisible:!0,precacheAllowed:!0,externalApiAllowed:!0,userReferenceAllowed:!1},visibility:{scope:`system`},license:{cacheAllowedByLicense:!0,publicUseAllowed:!1,officialStatus:`internal`,licenseType:`unknown`}},i(),!0;if(t.target.closest(`[data-tile-sources-cancel="source"]`))return n.editingTileSource=null,i(),!0;let u=t.target.closest(`[data-tile-sources-toggle-source]`);if(u){let e=u.getAttribute(`data-tile-sources-toggle-source`),t=(n.tileSources||[]).find(t=>t.id===e);if(!t)return!0;let a=t.enabled===!1;n.loading=!0,i();try{await r.updateTileSource(e,{enabled:a}),await Oi(n,r,{tileSources:!0}),o(`图源已${a?`启用`:`禁用`}`)}catch(e){o(``,e.message)}finally{n.loading=!1,i()}return!0}let d=t.target.closest(`[data-tile-sources-edit-source]`);if(d){let e=d.getAttribute(`data-tile-sources-edit-source`);n.loading=!0,i();try{n.editingTileSource=await r.getTileSource(e)}catch(e){o(``,e.message)}finally{n.loading=!1,i()}return!0}let f=t.target.closest(`[data-tile-sources-delete-source]`);if(f){let e=f.getAttribute(`data-tile-sources-delete-source`);if(await a(`确定要删除图源 "${e}" 吗？如果该图源已被图层或发布项引用将报错阻止。`,`确认删除图源`)){n.loading=!0,i();try{await r.deleteTileSource(e),await Oi(n,r,{tileSources:!0}),o(`删除图源成功`)}catch(e){o(``,e.message)}finally{n.loading=!1,i()}}return!0}let p=t.target.closest(`[data-tile-sources-test-source]`);if(p){let e=p.getAttribute(`data-tile-sources-test-source`);n[`test_source_${e}`]=`loading`,i();try{let t=await r.testTileSource(e);n[`test_source_${e}`]=t}catch(t){n[`test_source_${e}`]={success:!1,error:t.message}}finally{i()}return!0}let m=t.target.closest(`[data-tile-sources-create-from-preset]`);if(m){let e=m.getAttribute(`data-tile-sources-create-from-preset`),t=(n.sourcePresets||[]).find(t=>t.presetId===e);if(!t)return!0;let r=ei(t,n.keyPools||[]);return n.creatingSourceFromPreset={presetId:e,id:e.replace(/^preset:/,``),name:t.name,enabled:!1,keyPoolId:r?.id||``,permissions:{frontendVisible:!1,externalApiAllowed:!1,userReferenceAllowed:!1}},i(),!0}if(t.target.closest(`[data-tile-sources-cancel="preset-source"]`))return n.creatingSourceFromPreset=null,i(),!0;if(t.target.closest(`[data-tile-sources-add="key-pool"]`))return n.editingKeyPool={id:``,name:``,vendor:`custom`,enabled:!0,scope:`global`,strategy:`round_robin`,cooldownMs:3e5,maxRetriesPerRequest:2,defaultSecretType:`api_key`,defaultPlacement:`query`,defaultParamName:`key`,credentialUrl:``,allowedPresetIds:[],allowedSourceIds:[],keys:[{id:``,alias:``,enabled:!0,secretType:`api_key`,placement:`query`,paramName:`key`,priority:100,weight:1,qpsLimit:0,dailyLimit:0,monthlyLimit:0}],description:``},i(),!0;if(t.target.closest(`[data-tile-sources-cancel="key-pool"]`))return n.editingKeyPool=null,i(),!0;let h=t.target.closest(`[data-tile-sources-toggle-key-pool]`);if(h){let e=h.getAttribute(`data-tile-sources-toggle-key-pool`),t=(n.keyPools||[]).find(t=>t.id===e);if(!t)return!0;let a=t.enabled===!1;n.loading=!0,i();try{await r.updateKeyPool(e,{enabled:a}),await Oi(n,r,{keyPools:!0,precacheCatalog:!1}),o(`密钥池已${a?`启用`:`禁用`}`)}catch(e){o(``,e.message)}finally{n.loading=!1,i()}return!0}let g=t.target.closest(`[data-tile-sources-edit-key-pool]`);if(g){let e=g.getAttribute(`data-tile-sources-edit-key-pool`);n.loading=!0,i();try{n.editingKeyPool=await r.getKeyPool(e)}catch(e){o(``,e.message)}finally{n.loading=!1,i()}return!0}let _=t.target.closest(`[data-tile-sources-delete-key-pool]`);if(_){let e=_.getAttribute(`data-tile-sources-delete-key-pool`);if(await a(`确认删除密钥池 "${e}"？如果仍被图源引用将被后端阻止。`,`删除密钥池`)){n.loading=!0,i();try{await r.deleteKeyPool(e),await Oi(n,r,{keyPools:!0,precacheCatalog:!1}),o(`删除密钥池成功`)}catch(e){o(``,e.message)}finally{n.loading=!1,i()}}return!0}let ee=t.target.closest(`[data-tile-sources-test-key-pool]`);if(ee){let e=ee.getAttribute(`data-tile-sources-test-key-pool`);n[`test_key_pool_${e}`]=`loading`,i();try{n[`test_key_pool_${e}`]=await r.testKeyPool(e)}catch(t){n[`test_key_pool_${e}`]={success:!1,error:t.message}}finally{i()}return!0}let te=t.target.closest(`[data-tile-sources-test-key]`);if(te){vi(n,te.closest(`form`));let[e,t]=te.getAttribute(`data-tile-sources-test-key`).split(`:`);n[`test_key_${e}_${t}`]=`loading`,i();try{n[`test_key_${e}_${t}`]=await r.testKeyPoolKey(e,t)}catch(r){n[`test_key_${e}_${t}`]={success:!1,error:r.message}}finally{i()}return!0}if(t.target.closest(`[data-tile-sources-add-key]`))return n.editingKeyPool?(vi(n,t.target.closest(`form`)),n.editingKeyPool.keys=n.editingKeyPool.keys||[],n.editingKeyPool.keys.push({id:``,alias:``,enabled:!0,secretType:n.editingKeyPool.defaultSecretType||`api_key`,placement:n.editingKeyPool.defaultPlacement||`query`,paramName:n.editingKeyPool.defaultParamName||`key`,priority:100,weight:1,qpsLimit:0,dailyLimit:0,monthlyLimit:0}),i(),!0):!0;let v=t.target.closest(`[data-tile-sources-remove-key]`);if(v){if(!n.editingKeyPool)return!0;vi(n,v.closest(`form`));let e=parseInt(v.getAttribute(`data-tile-sources-remove-key`),10);return n.editingKeyPool.keys.splice(e,1),i(),!0}if(t.target.closest(`[data-tile-sources-add="layer"]`))return n.editingMapLayer={id:``,name:``,type:`base`,sortOrder:10,minZoom:3,maxZoom:18,clients:[`2d`,`3d`],items:[{sourceId:``,opacity:1,zIndex:0}]},i(),!0;if(t.target.closest(`[data-tile-sources-cancel="layer"]`))return n.editingMapLayer=null,i(),!0;let y=t.target.closest(`[data-tile-sources-toggle-layer]`);if(y){let e=y.getAttribute(`data-tile-sources-toggle-layer`),t=(n.mapLayers||[]).find(t=>t.id===e);if(!t)return!0;let a=t.enabled===!1;if(t.default&&!a)return o(``,`默认图层不能直接禁用，请先设置新的默认图层`),!0;n.loading=!0,i();try{await r.updateMapLayer(e,{enabled:a}),await Oi(n,r,{mapLayers:!0}),o(`组合图层已${a?`启用`:`禁用`}`)}catch(e){o(``,e.message)}finally{n.loading=!1,i()}return!0}let ne=t.target.closest(`[data-tile-sources-edit-layer]`);if(ne){let e=ne.getAttribute(`data-tile-sources-edit-layer`);return n.editingMapLayer=JSON.parse(JSON.stringify(n.mapLayers.find(t=>t.id===e))),i(),!0}let b=t.target.closest(`[data-tile-sources-delete-layer]`);if(b){let e=b.getAttribute(`data-tile-sources-delete-layer`);if(await a(`确认删除图层组合 "${e}"？`,`确认删除`)){n.loading=!0,i();try{await r.deleteMapLayer(e),await Oi(n,r,{mapLayers:!0}),o(`删除图层组合成功`)}catch(e){o(``,e.message)}finally{n.loading=!1,i()}}return!0}let re=t.target.closest(`[data-tile-sources-set-default]`);if(re){let e=re.getAttribute(`data-tile-sources-set-default`);n.loading=!0,i();try{await r.setDefaultMapLayer(e),await Oi(n,r,{mapLayers:!0}),o(`已将该图层设为默认展示`)}catch(e){o(``,e.message)}finally{n.loading=!1,i()}return!0}if(t.target.closest(`[data-tile-sources-add-layer-item]`))return n.editingMapLayer.items.push({sourceId:``,opacity:1,zIndex:n.editingMapLayer.items.length}),i(),!0;let x=t.target.closest(`[data-tile-sources-remove-layer-item]`);if(x){let e=parseInt(x.getAttribute(`data-tile-sources-remove-layer-item`));return n.editingMapLayer.items.length>1?(n.editingMapLayer.items.splice(e,1),i()):o(``,`图层组合中必须包含至少一个图源`),!0}let S=t.target.closest(`[data-tile-sources-move-up]`);if(S){let e=parseInt(S.getAttribute(`data-tile-sources-move-up`));if(e>0){let t=n.editingMapLayer.items,r=t[e];t[e]=t[e-1],t[e-1]=r,i()}return!0}let ie=t.target.closest(`[data-tile-sources-move-down]`);if(ie){let e=parseInt(ie.getAttribute(`data-tile-sources-move-down`)),t=n.editingMapLayer.items;if(e<t.length-1){let n=t[e];t[e]=t[e+1],t[e+1]=n,i()}return!0}if(t.target.closest(`[data-tile-sources-add="publish"]`))return n.editingExternalPublish={id:``,name:``,targetType:`source`,targetId:``,pathSlug:``,auth:{mode:`token`},rateLimit:{enabled:!0,maxRequestsPerMinute:600},log:{enabled:!0,maxLogCount:500},overrides:{proxy:null,cache:null},enabled:!0},i(),!0;if(t.target.closest(`[data-tile-sources-cancel="publish"]`))return n.editingExternalPublish=null,i(),!0;let C=t.target.closest(`[data-tile-sources-toggle-publish]`);if(C){let e=C.getAttribute(`data-tile-sources-toggle-publish`),t=(n.externalPublishes||[]).find(t=>t.id===e);if(!t)return!0;let a=t.enabled===!1;n.loading=!0,i();try{await r.updateExternalPublish(e,{enabled:a}),await Oi(n,r,{externalPublishes:!0,precacheCatalog:!1}),o(`对外发布项已${a?`发布`:`禁用`}`)}catch(e){o(``,e.message)}finally{n.loading=!1,i()}return!0}let ae=t.target.closest(`[data-tile-sources-edit-publish]`);if(ae){let e=ae.getAttribute(`data-tile-sources-edit-publish`);return n.editingExternalPublish=JSON.parse(JSON.stringify(n.externalPublishes.find(t=>t.id===e))),i(),!0}let w=t.target.closest(`[data-tile-sources-delete-publish]`);if(w){let e=w.getAttribute(`data-tile-sources-delete-publish`);if(await a(`确认注销并删除外部发布接口项 "${e}" 吗？`,`注销对外服务`)){n.loading=!0,i();try{await r.deleteExternalPublish(e),await Oi(n,r,{externalPublishes:!0,precacheCatalog:!1}),o(`成功注销对外发布服务`)}catch(e){o(``,e.message)}finally{n.loading=!1,i()}}return!0}let T=t.target.closest(`[data-tile-sources-reset-token]`);if(T){let e=T.getAttribute(`data-tile-sources-reset-token`);if(await a(`确认要重置该对外服务的 Token 吗？旧 Token 将会立即失效！`,`重置 Token 凭证`)){n.loading=!0,i();try{n.lastGeneratedToken=(await r.resetExternalPublishToken(e)).token,await Oi(n,r,{externalPublishes:!0,precacheCatalog:!1}),o(`Token 已重置，请记录您的新明文 Token`)}catch(e){o(``,e.message)}finally{n.loading=!1,i()}}return!0}let E=t.target.closest(`[data-tile-sources-test-publish]`);if(E){let e=E.getAttribute(`data-tile-sources-test-publish`);n[`test_publish_${e}`]=`loading`,i();try{let t=await r.testExternalPublish(e);n[`test_publish_${e}`]=t}catch(t){n[`test_publish_${e}`]={success:!1,error:t.message}}finally{i()}return!0}return!1}async function Hi(e){let{event:t,state:n,api:r,renderDashboard:i,setNotice:a}=e,o=t.target.closest(`[data-tile-sources-form]`);if(!o)return!1;t.preventDefault();let s=o.getAttribute(`data-tile-sources-form`);n.loading=!0,i();let c=new FormData(o),l=c.get(`isNew`)===`true`;try{if(s===`source`){let e=c.get(`id`),t=c.get(`tileScale`)||`1`,i=c.get(`kind`)||`xyz-raster`,s=pi(c),u=hi(o,c);qr(i)&&u.engine===`leaflet`&&(u.engine=`maplibre`);let d={id:e,name:c.get(`name`),enabled:!!o.elements.enabled?.checked,vendor:c.get(`vendor`),category:c.get(`category`),kind:i,adapter:c.get(`adapter`),presetId:c.get(`presetId`)||``,schema:c.get(`schema`)||``,entry:s,template:s.template,styleJsonUrl:s.styleJsonUrl,tileJsonUrl:s.tileJsonUrl,pmtilesUrl:s.pmtilesUrl,subdomains:fi(c,`subdomains`),minZoom:parseInt(c.get(`minZoom`)),maxZoom:parseInt(c.get(`maxZoom`)),maxNativeZoom:parseInt(c.get(`maxNativeZoom`)),tileSize:256,retina:{mode:`fixed`,param:`scale`,normalValue:t,retinaValue:t},secrets:mi(o,c),rendering:u,attribution:c.get(`license_attribution`)||``,coordinateSystem:c.get(`coordinateSystem`)||`EPSG:3857`,tags:fi(c,`tags`),description:c.get(`description`),license:gi(o,c),cache:di(o,c,`cache`),proxy:li(o,c,`proxy`),accessLog:{enabled:!!o.elements.accessLog_enabled?.checked,maxLogCount:parseInt(c.get(`accessLog_maxLogCount`))||0},permissions:{frontendVisible:o.elements.perm_frontendVisible.checked,precacheAllowed:o.elements.perm_precacheAllowed.checked,externalApiAllowed:o.elements.perm_externalApiAllowed.checked,userReferenceAllowed:!!o.elements.perm_userReferenceAllowed?.checked},visibility:{scope:c.get(`visibility_scope`)||`system`}};l?await r.createTileSource(d):await r.updateTileSource(e,d),n.editingTileSource=null,await Oi(n,r,{tileSources:!0}),a(`保存图源配置成功`)}else if(s===`preset-source`){let e=c.get(`presetId`),t=o.elements.enabled,i={id:c.get(`id`),name:c.get(`name`),enabled:!!(t&&!t.disabled&&t.checked),keyPoolId:c.get(`keyPoolId`)||``,permissions:{frontendVisible:!!o.elements.perm_frontendVisible?.checked,precacheAllowed:!1,externalApiAllowed:!!o.elements.perm_externalApiAllowed?.checked,userReferenceAllowed:!!o.elements.perm_userReferenceAllowed?.checked},visibility:{scope:`system`}};await r.createSourceFromPreset(e,i),n.creatingSourceFromPreset=null,n.tileSourcesSubTab=`sources`,await Oi(n,r,{tileSources:!0}),a(`已基于预设创建图源`)}else if(s===`key-pool`){let e=c.get(`id`),t=_i(o,c);l?await r.createKeyPool(t):await r.updateKeyPool(e,t),n.editingKeyPool=null,await Oi(n,r,{keyPools:!0,precacheCatalog:!1}),a(`保存密钥池成功`)}else if(s===`layer`){let e=c.get(`id`),t=o.querySelectorAll(`select[name="item_sourceId"]`),i=o.querySelectorAll(`input[name="item_opacity"]`),s=[];if(t.forEach((e,t)=>{e.value&&s.push({sourceId:e.value,opacity:parseFloat(i[t].value||1),zIndex:t})}),!s.length)throw Error(`组合图层必须包含至少一个有效图源`);let u={id:e,name:c.get(`name`),enabled:o.elements.enabled.checked,frontendVisible:o.elements.frontendVisible.checked,default:n.editingMapLayer.default||!1,type:c.get(`type`),sortOrder:parseInt(c.get(`sortOrder`)),minZoom:parseInt(c.get(`minZoom`)),maxZoom:parseInt(c.get(`maxZoom`)),clients:[o.elements.client_2d.checked?`2d`:``,o.elements.client_3d.checked?`3d`:``].filter(Boolean),items:s,description:c.get(`description`)};l?await r.createMapLayer(u):await r.updateMapLayer(e,u),n.editingMapLayer=null,await Oi(n,r,{mapLayers:!0}),a(`保存图层组合成功`)}else if(s===`publish`){let e=c.get(`id`),t=!!o.elements.proxy_override_enabled?.checked,i=!!o.elements.cache_override_enabled?.checked,s={id:e,name:c.get(`name`),enabled:o.elements.enabled.checked,targetType:c.get(`targetType`),targetId:c.get(`targetId`),pathSlug:c.get(`pathSlug`),auth:{mode:c.get(`auth_mode`)},rateLimit:{enabled:o.elements.rateLimit_enabled.checked,maxRequestsPerMinute:parseInt(c.get(`rateLimit_maxRequestsPerMinute`))},log:{enabled:o.elements.log_enabled.checked,maxLogCount:parseInt(c.get(`log_maxLogCount`))},overrides:{proxy:t?li(o,c,`publish_proxy`):null,cache:i?di(o,c,`publish_cache`):null}};l?n.lastGeneratedToken=(await r.createExternalPublish(s)).token:await r.updateExternalPublish(e,s),n.editingExternalPublish=null,await Oi(n,r,{externalPublishes:!0,precacheCatalog:!1}),a(`保存对外发布服务成功`)}}catch(e){a(``,e.message)}finally{n.loading=!1,i()}return!0}async function Ui(e){let{event:t,state:n,renderDashboard:r}=e,i=t.target.closest(`[data-proxy-mode-select]`);if(i){let e=i.value,t=i.closest(`form`),n=t.querySelector(`[data-proxy-outbound-field]`),r=t.querySelector(`[data-proxy-pool-field]`);return n&&(n.style.display=e===`fixed`?`flex`:`none`),r&&(r.style.display=e===`pool`?`flex`:`none`),!0}let a=t.target.closest(`select[name="kind"]`);if(a&&n.editingTileSource){let e=a.closest(`form`),t=e.elements.adapter,n=e.elements.rendering_engine,r=e.elements.rendering_client_3d;return qr(a.value)?(t&&(!t.value||t.value===`template`)&&(t.value=`maplibre-style`),n&&n.value===`leaflet`&&(n.value=`maplibre`),r&&(r.checked=!1)):t&&!t.value&&(t.value=`template`),!0}let o=t.target.closest(`[data-publish-target-type]`);if(o&&n.editingExternalPublish)return n.editingExternalPublish.targetType=o.value,n.editingExternalPublish.targetId=``,r(),!0;let s=t.target.closest(`[data-tile-sources-diagnostic-filter]`);if(s)return n.diagnosticsLogType=`external`,n.diagnosticsPublishId=s.value,await zi(n,e.api),r(),!0;let c=t.target.closest(`[data-tile-sources-source-diagnostic-filter]`);if(c)return n.diagnosticsLogType=`source`,n.diagnosticsSourceId=c.value,await Bi(n,e.api),r(),!0;if(n.editingMapLayer){let e=t.target.closest(`select[name="item_sourceId"]`),r=t.target.closest(`input[name="item_opacity"]`);if(e||r){let i=t.target.closest(`[data-layer-item-index]`),a=parseInt(i.getAttribute(`data-layer-item-index`));return e&&(n.editingMapLayer.items[a].sourceId=e.value),r&&(n.editingMapLayer.items[a].opacity=parseFloat(r.value||1)),!0}}return!1}function Wi(e){return e?.errorMessage||e?.error||``}function Gi(e){let t=Array.isArray(e?.members)?e.members:[];if(!t.length)return{successCount:0,totalCount:0,fastestMs:null};let n=t.filter(e=>e.success),r=n.map(e=>Number(e.duration)).filter(Number.isFinite);return{successCount:n.length,totalCount:t.length,fastestMs:r.length?Math.min(...r):null}}function Ki(e){e.editingProxyOutbound=e.editingProxyOutbound||null,e.editingProxyPool=e.editingProxyPool||null;let t=e.proxyOutbounds||[],n=e.proxyPools||[],r=e.editingProxyOutbound,i=e.editingProxyPool,a=``;if(r){let e=!t.some(e=>e.id===r.id);a=`
      <div class="form-card animate-fade-in">
        <h3>${e?`创建代理出口`:`编辑代理出口: ${Q(r.id)}`}</h3>
        <form data-proxy-form="outbound">
          <input type="hidden" name="isNew" value="${e}">
          <div class="form-grid">
            <div class="field-group">
              <label>出口 ID</label>
              <input name="id" value="${Q(r.id||``)}" required ${e?``:`readonly`} placeholder="例如: hk-clash">
            </div>
            <div class="field-group">
              <label>出口名称</label>
              <input name="name" value="${Q(r.name||``)}" required placeholder="例如: 香港节点">
            </div>
          </div>
          <div class="form-grid">
            <div class="field-group">
              <label>协议</label>
              <select name="protocol">
                <option value="http" ${r.protocol===`http`?`selected`:``}>HTTP</option>
                <option value="https" ${r.protocol===`https`?`selected`:``}>HTTPS</option>
              </select>
            </div>
            <div class="field-group">
              <label>代理服务器地址</label>
              <input name="host" value="${Q(r.host||``)}" required placeholder="example">
            </div>
          </div>
          <div class="form-grid">
            <div class="field-group">
              <label>端口</label>
              <input name="port" type="number" value="${r.port??7890}" required>
            </div>
            <div class="field-group">
              <label>用户名</label>
              <input name="username" value="${Q(r.username||``)}">
            </div>
          </div>
          <div class="form-grid">
            <div class="field-group">
              <label>密码（留空不修改）</label>
              <input name="password" type="password" placeholder="${r.hasPassword?`********`:`无密码`}">
            </div>
            <div class="field-group">
              <label>连通测试链接</label>
              <input name="testUrl" value="${Q(r.testUrl||`https://www.google.com/generate_204`)}">
            </div>
          </div>
          <div class="form-grid">
            <div class="field-group">
              <label>超时时间（毫秒）</label>
              <input name="timeoutMs" type="number" value="${r.timeoutMs??8e3}">
            </div>
            <div class="field-group">
              <label>备注描述</label>
              <input name="description" value="${Q(r.description||``)}">
            </div>
          </div>
          
          <div class="checkbox-group" style="margin-top:15px;">
            <input type="checkbox" id="outbound_enabled" name="enabled" ${r.enabled===!1?``:`checked`}>
            <label for="outbound_enabled" style="font-weight:600;">启用该代理出口</label>
          </div>

          <div style="margin-top:25px; display:flex; gap:15px;">
            <button type="submit" class="admin-form-submit">保存出口</button>
            <button type="button" class="admin-form-cancel" data-proxy-cancel="outbound">取消</button>
          </div>
        </form>
      </div>
    `}else if(i){let e=!n.some(e=>e.id===i.id),r=i.members||[];a=`
      <div class="form-card animate-fade-in">
        <h3>${e?`创建代理池`:`编辑代理池: ${Q(i.id)}`}</h3>
        <form data-proxy-form="pool">
          <input type="hidden" name="isNew" value="${e}">
          <div class="form-grid">
            <div class="field-group">
              <label>代理池 ID</label>
              <input name="id" value="${Q(i.id||``)}" required ${e?``:`readonly`} placeholder="例如: proxy-pool-hk">
            </div>
            <div class="field-group">
              <label>代理池名称</label>
              <input name="name" value="${Q(i.name||``)}" required placeholder="例如: 智能负载代理池">
            </div>
          </div>
          <div class="form-grid">
            <div class="field-group">
              <label>负载分配策略</label>
              <select name="strategy">
                <option value="priority" ${i.strategy===`priority`?`selected`:``}>按优先级顺序选择</option>
                <option value="round_robin" ${i.strategy===`round_robin`?`selected`:``}>均摊轮询选择</option>
                <option value="failover" ${i.strategy===`failover`?`selected`:``}>主备失败自动切换</option>
              </select>
            </div>
            <div class="field-group">
              <label>代理池描述</label>
              <input name="description" value="${Q(i.description||``)}">
            </div>
          </div>

          <div class="field-group" style="margin-top:15px;">
            <label style="font-weight:600;">关联代理出口及优先级/权重</label>
            <div class="layer-items-list">
              ${t.map(e=>{let t=r.find(t=>t.outboundId===e.id),n=!!t,i=t?.priority??100,a=t?.weight??1;return`
                  <div style="display:flex; gap:12px; align-items:center; background:#f8fafc; padding:6px 12px; border-radius:4px;">
                    <label style="display:inline-flex; align-items:center; gap:8px; width:220px; font-weight:500; cursor:pointer;">
                      <input type="checkbox" name="pool_outbound_id" value="${e.id}" ${n?`checked`:``}>
                      <span>${Q(e.name)}</span>
                      <small style="color:#64748b;">(${e.host}:${e.port})</small>
                    </label>
                    <div style="display:flex; align-items:center; gap:4px;">
                      <span style="font-size:12px; color:#475569;">优先级:</span>
                      <input name="pool_priority_${e.id}" type="number" value="${i}" style="width:60px; padding:4px;">
                    </div>
                    <div style="display:flex; align-items:center; gap:4px;">
                      <span style="font-size:12px; color:#475569;">权重:</span>
                      <input name="pool_weight_${e.id}" type="number" value="${a}" style="width:60px; padding:4px;">
                    </div>
                  </div>
                `}).join(``)||`<p style="color:#64748b;">暂无可用的代理出口，请先在下方创建代理出口！</p>`}
            </div>
          </div>

          <div class="checkbox-group" style="margin-top:15px;">
            <input type="checkbox" id="pool_enabled" name="enabled" ${i.enabled===!1?``:`checked`}>
            <label for="pool_enabled" style="font-weight:600;">启用该代理池</label>
          </div>

          <div style="margin-top:25px; display:flex; gap:15px;">
            <button type="submit" class="admin-form-submit">保存代理池</button>
            <button type="button" class="admin-form-cancel" data-proxy-cancel="pool">取消</button>
          </div>
        </form>
      </div>
    `}else a=`
      <div style="margin-bottom:40px;">
        <div class="admin-panel-head">
          <h3>代理出口</h3>
          <button type="button" data-proxy-add="outbound">+ 新建代理出口</button>
        </div>
        
        <table class="item-table">
          <thead>
            <tr>
              <th>ID / 出口名称</th>
              <th>协议</th>
              <th>出口主机</th>
              <th>代理认证</th>
              <th>接口测试</th>
              <th>状态</th>
              <th>管理操作</th>
            </tr>
          </thead>
          <tbody>
            ${t.map(t=>{let n=e[`test_outbound_${t.id}`]||``;return`
                <tr>
                  <td>
                    <strong>${Q(t.name)}</strong>
                    <div style="color: #64748b; font-size:11px; margin-top:2px;">${Q(t.id)}</div>
                  </td>
                  <td><span class="badge-gray">${t.protocol.toUpperCase()}</span></td>
                  <td><code>${Q(t.host)}:${t.port}</code></td>
                  <td>
                    ${t.username?`<span class="badge-blue" title="已配置代理用户名密码">${Q(t.username)}</span>`:`<span style="color:#94a3b8; font-size:12px;">免密/匿名</span>`}
                  </td>
                  <td>
                    <button type="button" class="btn-link" data-proxy-test-outbound="${t.id}">测试连接</button>
                    ${n===`loading`?`<span class="test-status test-loading">测试中...</span>`:``}
                    ${n&&n!==`loading`&&n.success?`<span class="test-status test-success">成功 (${n.duration}ms)</span>`:``}
                    ${n&&n!==`loading`&&!n.success?`<span class="test-status test-fail" title="${Q(Wi(n))}">失败: ${Q(Wi(n))}</span>`:``}
                  </td>
                  <td>
                    ${t.enabled?`<span class="badge-green">已启用</span>`:`<span class="badge-red">已禁用</span>`}
                  </td>
                  <td>
                    <div class="flex-actions">
                      <button type="button" class="btn-link" data-proxy-edit-outbound="${t.id}">编辑</button>
                      <button type="button" class="btn-link btn-danger-link" data-proxy-delete-outbound="${t.id}">删除</button>
                    </div>
                  </td>
                </tr>
              `}).join(``)||`<tr><td colspan="7" style="text-align:center; color:#64748b; padding:20px;">暂无配置的代理出口</td></tr>`}
          </tbody>
        </table>
      </div>

      <div>
        <div class="admin-panel-head">
          <h3>代理出口池</h3>
          <button type="button" data-proxy-add="pool">+ 新建代理池</button>
        </div>
        
        <table class="item-table">
          <thead>
            <tr>
              <th>ID / 代理池名称</th>
              <th>路由分配策略</th>
              <th>关联出口数量</th>
              <th>连通批量测试</th>
              <th>使用状态</th>
              <th>管理操作</th>
            </tr>
          </thead>
          <tbody>
            ${n.map(t=>{let n=e[`test_pool_${t.id}`]||``,r=n&&n!==`loading`?Gi(n):null;return`
                <tr>
                  <td>
                    <strong>${Q(t.name)}</strong>
                    <div style="color: #64748b; font-size:11px; margin-top:2px;">${Q(t.id)}</div>
                  </td>
                  <td>
                    <span class="badge-blue">${Q(t.strategy)}</span>
                  </td>
                  <td>
                    <strong>${(t.members||[]).length}</strong> 个出口
                  </td>
                  <td>
                    <button type="button" class="btn-link" data-proxy-test-pool="${t.id}">批量连通测试</button>
                    ${n===`loading`?`<span class="test-status test-loading">测试中...</span>`:``}
                    ${n&&n!==`loading`&&n.success?`<span class="test-status test-success">可用 ${r.successCount}/${r.totalCount}${r.fastestMs===null?``:` (最快: ${r.fastestMs}ms)`}</span>`:``}
                    ${n&&n!==`loading`&&!n.success?`<span class="test-status test-fail" title="${Q(Wi(n))}">失败: ${Q(Wi(n))}</span>`:``}
                  </td>
                  <td>
                    ${t.enabled?`<span class="badge-green">已启用</span>`:`<span class="badge-red">已禁用</span>`}
                  </td>
                  <td>
                    <div class="flex-actions">
                      <button type="button" class="btn-link" data-proxy-edit-pool="${t.id}">编辑</button>
                      <button type="button" class="btn-link btn-danger-link" data-proxy-delete-pool="${t.id}">删除</button>
                    </div>
                  </td>
                </tr>
              `}).join(``)||`<tr><td colspan="6" style="text-align:center; color:#64748b; padding:20px;">暂无配置的代理出口池</td></tr>`}
          </tbody>
        </table>
      </div>
    `;return`
    <section class="admin-panel tile-sources-panel">


      ${a}
    </section>
  `}function qi(e){e.editingProxyOutbound=null,e.editingProxyPool=null}async function Ji({api:e,event:t,state:n,renderDashboard:r,showConfirm:i,setNotice:a}){if(t.target.closest(`[data-proxy-add="outbound"]`))return n.editingProxyOutbound={id:``,name:``,protocol:`http`,host:``,port:7890,username:``,password:``,testUrl:`https://www.google.com/generate_204`,timeoutMs:8e3,description:``,enabled:!0},r(),!0;if(t.target.closest(`[data-proxy-cancel="outbound"]`))return n.editingProxyOutbound=null,r(),!0;if(t.target.closest(`[data-proxy-edit-outbound]`)){let e=t.target.closest(`[data-proxy-edit-outbound]`).getAttribute(`data-proxy-edit-outbound`);return n.editingProxyOutbound=JSON.parse(JSON.stringify(n.proxyOutbounds.find(t=>t.id===e))),r(),!0}if(t.target.closest(`[data-proxy-delete-outbound]`)){let o=t.target.closest(`[data-proxy-delete-outbound]`).getAttribute(`data-proxy-delete-outbound`);if(await i(`确认删除代理出口 “${Q(o)}” 吗？`)){a(`正在删除代理出口`);try{await e.deleteProxyOutbound(o),n.proxyOutbounds=await e.listProxyOutbounds(),a(`删除成功`)}catch(e){a(``,e.message)}r()}return!0}if(t.target.closest(`[data-proxy-test-outbound]`)){let i=t.target.closest(`[data-proxy-test-outbound]`).getAttribute(`data-proxy-test-outbound`);n[`test_outbound_${i}`]=`loading`,r();try{let t=await e.testProxyOutbound(i);n[`test_outbound_${i}`]=t}catch(e){n[`test_outbound_${i}`]={success:!1,error:e.message}}return r(),!0}if(t.target.closest(`[data-proxy-add="pool"]`))return n.editingProxyPool={id:``,name:``,strategy:`priority`,description:``,enabled:!0,members:[]},r(),!0;if(t.target.closest(`[data-proxy-cancel="pool"]`))return n.editingProxyPool=null,r(),!0;if(t.target.closest(`[data-proxy-edit-pool]`)){let e=t.target.closest(`[data-proxy-edit-pool]`).getAttribute(`data-proxy-edit-pool`);return n.editingProxyPool=JSON.parse(JSON.stringify(n.proxyPools.find(t=>t.id===e))),r(),!0}if(t.target.closest(`[data-proxy-delete-pool]`)){let o=t.target.closest(`[data-proxy-delete-pool]`).getAttribute(`data-proxy-delete-pool`);if(await i(`确认删除代理池 “${Q(o)}” 吗？`)){a(`正在删除代理池`);try{await e.deleteProxyPool(o),n.proxyPools=await e.listProxyPools(),a(`删除成功`)}catch(e){a(``,e.message)}r()}return!0}if(t.target.closest(`[data-proxy-test-pool]`)){let i=t.target.closest(`[data-proxy-test-pool]`).getAttribute(`data-proxy-test-pool`);n[`test_pool_${i}`]=`loading`,r();try{let t=await e.testProxyPool(i);n[`test_pool_${i}`]=t}catch(e){n[`test_pool_${i}`]={success:!1,error:e.message}}return r(),!0}return!1}async function Yi({api:e,event:t,state:n,renderDashboard:r,setNotice:i}){let a=t.target.closest(`[data-proxy-form="outbound"]`);if(a){t.preventDefault(),i(`正在保存代理出口`);let o=a.elements.isNew.value===`true`,s=a.elements.id.value.trim(),c={name:a.elements.name.value.trim(),protocol:a.elements.protocol.value,host:a.elements.host.value.trim(),port:parseInt(a.elements.port.value,10),username:a.elements.username.value.trim(),testUrl:a.elements.testUrl.value.trim(),timeoutMs:parseInt(a.elements.timeoutMs.value,10),description:a.elements.description.value.trim(),enabled:a.elements.enabled.checked},l=a.elements.password.value;l&&(c.password=l);try{o?await e.createProxyOutbound({id:s,...c}):await e.updateProxyOutbound(s,c),n.proxyOutbounds=await e.listProxyOutbounds(),n.editingProxyOutbound=null,i(`保存成功`)}catch(e){i(``,e.message)}return r(),!0}let o=t.target.closest(`[data-proxy-form="pool"]`);if(o){t.preventDefault(),i(`正在保存代理池`);let a=o.elements.isNew.value===`true`,s=o.elements.id.value.trim(),c=[];o.querySelectorAll(`input[name="pool_outbound_id"]:checked`).forEach(e=>{let t=e.value,n=parseInt(o.querySelector(`[name="pool_priority_${t}"]`).value,10),r=parseInt(o.querySelector(`[name="pool_weight_${t}"]`).value,10);c.push({outboundId:t,priority:n,weight:r})});let l={name:o.elements.name.value.trim(),strategy:o.elements.strategy.value,description:o.elements.description.value.trim(),enabled:o.elements.enabled.checked,members:c};try{a?await e.createProxyPool({id:s,...l}):await e.updateProxyPool(s,l),n.proxyPools=await e.listProxyPools(),n.editingProxyPool=null,i(`保存成功`)}catch(e){i(``,e.message)}return r(),!0}return!1}function Xi(){return!1}var Zi=[{id:`overview`,label:`概览`,render:Cn},{id:`cache`,label:`缓存`,render:wn,handleClick:Tn},{id:`kml`,label:`KML管理`,render:Er,handleClick:Dr,handleChange:Or},{id:`precache`,label:`预缓存`,render:Un,afterRender:xr,afterEnter:ar,afterLoad:ar,handleSubmit:lr,handleClick:ur,handleChange:dr},{id:`tile-sources`,label:`图源管理`,render:ki,afterEnter:Li,afterLoad:Li,handleClick:Vi,handleSubmit:Hi,handleChange:Ui},{id:`proxy`,label:`代理配置`,render:Ki,afterEnter:qi,afterLoad:qi,handleClick:Ji,handleSubmit:Yi,handleChange:Xi},{id:`settings`,label:`设置`,render:wr,handleSubmit:Tr}];function Qi(e){return`/admin/${$i(e).id}`}function $i(e){return Zi.find(t=>t.id===e)||Zi[0]}function ea(e){return Zi.some(t=>t.id===e)}function ta(e){return e.pathname===`/admin`||e.pathname.startsWith(`/admin/`)||new URLSearchParams(e.search).get(`view`)===`admin`}function na(e){let[,t,n]=e.pathname.split(`/`);if(t===`admin`)return ea(n)?n:`overview`;let r=new URLSearchParams(e.search).get(`tab`);return ea(r)?r:`overview`}function ra(e){if(!e.message&&!e.error&&!e.loading)return``;let t=e.error||e.message||`正在加载`,n=!!e.error,r=!e.error&&(e.message===`正在加载`||e.message===`正在登录`||e.loading);return`
    <div class="admin-notice ${n?`is-error`:``}" role="${n?`alert`:`status`}" aria-live="${n?`assertive`:`polite`}">
      <span>${Q(t)}</span>
      ${r?``:`<button type="button" class="admin-notice-close" data-admin-action="close-notice" aria-label="关闭提示">×</button>`}
    </div>
  `}function ia(e){e.root.innerHTML=`
    <section class="admin-login">
      <form class="admin-login-panel" data-admin-login>
        <p class="admin-kicker">map-service</p>
        <h1>管理后台</h1>
        ${ra(e)}
        <label>
          <span>用户名</span>
          <input name="username" autocomplete="username" required>
        </label>
        <label>
          <span>密码</span>
          <input name="password" type="password" autocomplete="current-password" required>
        </label>
        <button type="submit">登录</button>
        <a href="/">返回地图</a>
      </form>
    </section>
  `}function aa(e,t){e.root.innerHTML=`
    <section class="admin-shell">
      <header class="admin-topbar">
        <div>
          <p class="admin-kicker">map-service</p>
          <h1>管理后台</h1>
        </div>
        <nav class="admin-actions" aria-label="管理后台操作">
          <a class="admin-icon-link" href="/" aria-label="返回地图">⌖</a>
          <button type="button" data-admin-action="refresh" aria-label="刷新">↻</button>
          <button type="button" data-admin-action="logout" aria-label="退出">⎋</button>
        </nav>
      </header>
      ${ra(e)}
      <div class="admin-layout">
        <nav class="admin-tabs" aria-label="后台导航">
          ${Zi.map(t=>`
            <a href="${Qi(t.id)}" data-admin-tab="${t.id}" class="${e.activeTab===t.id?`is-active`:``}">
              ${Q(t.label)}
            </a>
          `).join(``)}
        </nav>
        <div class="admin-content">
          ${t}
        </div>
      </div>
    </section>
  `}var $={root:null,activeTab:`overview`,loading:!1,message:``,error:``,session:null,system:null,cache:null,cacheLoading:!1,cacheError:``,visits:null,visitsLoading:!1,visitsError:``,settings:null,tasks:[],kmls:[],precacheForm:{providerId:``,bounds:{west:113.24,south:23.11,east:113.29,north:23.15},minZoom:12,maxZoom:12,concurrency:4,requestIntervalMs:0,refresh:!1},precacheEstimate:null,precacheEstimateStatus:``,precacheEstimateError:``,expandedTaskIds:new Set,amapLoader:null,AMap:null,map:null,rectangle:null,precacheMapHeight:260},oa=null;function sa(e){oa=e}function ca(e=``,t=``){$.message=e,$.error=t,oa&&oa(e,t)}function la(e){ea(e)&&($.activeTab=e)}var ua=null;sa((e,t)=>{ua&&=(clearTimeout(ua),null);let n=t||e;n&&n!==`正在加载`&&n!==`正在登录`&&(ua=setTimeout(()=>{ca(``),document.querySelector(`[data-admin-login]`)?ia($):ma()},4e3))});function da(){return na(window.location)}function fa(e){window.history.replaceState(null,``,`${Qi(e)}${window.location.hash}`)}function pa(){return $i($.activeTab).render($)}function ma(){aa($,pa()),$i($.activeTab).afterRender?.($,Z)}window.renderDashboard=ma;function ha(e){return{api:Z,event:e,renderDashboard:ma,setNotice:ca,showCheckboxConfirm:Se,showConfirm:xe,state:$}}function ga(...e){(!e.length||e.includes($.activeTab))&&ma()}async function _a(e,t){let n=$i($.activeTab)[e];return n instanceof Function?!!await n(ha(t)):!1}async function va(e={}){let t=!!e.cacheOnly;Object.assign($,{cacheLoading:!0,cacheError:``,visitsLoading:t?$.visitsLoading:!0,visitsError:t?$.visitsError:``}),ga(`overview`,`cache`),Z.cache().then(e=>{$.cache=e,$.cacheError=``,e.refreshing&&window.setTimeout(()=>va({cacheOnly:!0}),1500)}).catch(e=>{$.cacheError=e.message}).finally(()=>{$.cacheLoading=!1,ga(`cache`)}),!t&&Z.visits().then(e=>{$.visits=e,$.visitsError=``}).catch(e=>{$.visitsError=e.message}).finally(()=>{$.visitsLoading=!1,ga(`overview`)})}async function ya(){$.loading=!0,ca(`正在加载`),ma();try{let[e,t,n,r,i,a,o,s,c,l,u,d,f]=await Promise.all([Z.session(),Z.system(),Z.settings(),Z.tasks(),Z.kmls(),Z.listTileSources(),Z.listSourcePresets(),Z.listKeyPools(),Z.listMapLayers(),Z.listProxyOutbounds(),Z.listProxyPools(),Z.listExternalPublishes(),Z.precacheCatalog()]);Object.assign($,{session:e,system:t,settings:n,tasks:r,kmls:i,tileSources:a,sourcePresets:o,keyPools:s,mapLayers:c,proxyOutbounds:l,proxyPools:u,externalPublishes:d,precacheCatalog:f,loading:!1}),ca(``),ma(),$i($.activeTab).afterLoad?.($,Z),va()}catch(e){$.loading=!1,e.status===401?(gn(),ca(``,e.message),ia($)):(ca(``,e.message),ma())}}async function ba(e){let t=e.target.closest(`[data-admin-login]`);if(t){e.preventDefault(),ca(`正在登录`),ia($);try{await hn({username:t.elements.username.value,password:t.elements.password.value}),ca(``),await ya()}catch(e){ca(``,e.message),ia($)}return}await _a(`handleSubmit`,e)}async function xa(e){let t=e.target.closest(`[data-admin-tab]`);if(t){e.preventDefault(),la(t.getAttribute(`data-admin-tab`)),fa($.activeTab),ma(),$i($.activeTab).afterEnter?.($,Z);return}let n=e.target.closest(`[data-admin-action]`);if(n){let e=n.getAttribute(`data-admin-action`);if(e===`logout`){gn(),ca(``),ia($);return}if(e===`refresh`){await ya();return}if(e===`close-notice`){ca(``),document.querySelector(`[data-admin-login]`)?ia($):ma();return}}await _a(`handleClick`,e)}async function Sa(e){await _a(`handleChange`,e)}async function Ca(e={}){if(document.body.classList.add(`admin-view`),la(da()),fa($.activeTab),$.amapLoader=e.amapLoader||null,$.root=document.getElementById(`admin-root`),$.root.hidden=!1,$.root.addEventListener(`submit`,ba),$.root.addEventListener(`click`,xa),$.root.addEventListener(`change`,Sa),$.root.addEventListener(`input`,Sa),!pn()){ia($);return}await ya()}function wa(){`serviceWorker`in navigator&&window.addEventListener(`load`,()=>{navigator.serviceWorker.register(`/sw.js`).catch(e=>{console.warn(`Service Worker 注册失败`,e)})})}async function Ta(e){let{init:t,title:n=`私有地图服务`,message:r=`管理员启用了访问控制，请输入密码解锁`,submitText:i=`载入地图`,loadingText:a=`正在验证...`}=e;try{(await _n()).required?Ea({init:t,title:n,message:r,submitText:i,loadingText:a}):await t()}catch(e){console.error(`Failed to check map access status`,e),Ea({init:t,title:n,message:`访问状态检查失败，请稍后重试`,submitText:i,loadingText:a,allowRetry:!0})}}function Ea(e){let{init:t,title:n,message:r,submitText:i,loadingText:a,allowRetry:o=!1}=e;document.getElementById(`map-lock-screen`)?.remove();let s=document.createElement(`div`);s.id=`map-lock-screen`,s.className=`lock-screen-backdrop`,s.innerHTML=`
    <div class="lock-screen-card">
      <div class="lock-screen-icon">🔒</div>
      <h2>${Q(n)}</h2>
      <p>${Q(r)}</p>
      <form id="lock-screen-form" autocomplete="off">
        <div class="lock-screen-field">
          <input type="password" name="password" placeholder="请输入访问密码" required autofocus>
        </div>
        <div id="lock-screen-error" class="lock-screen-error" style="${o?``:`display: none;`}">${o?Q(r):``}</div>
        <button type="submit">${Q(i)}</button>
        ${o?`<button type="button" class="lock-screen-secondary" data-lock-retry>重试检查</button>`:``}
      </form>
    </div>
  `,document.body.appendChild(s);let c=document.getElementById(`lock-screen-form`),l=document.getElementById(`lock-screen-error`);s.querySelector(`[data-lock-retry]`)?.addEventListener(`click`,()=>{s.remove(),Ta({init:t,title:n,submitText:i,loadingText:a})}),c.addEventListener(`submit`,async e=>{e.preventDefault(),l.style.display=`none`;let n=c.elements.password.value.trim();if(!n)return;let r=c.querySelector(`button[type="submit"]`);try{r.disabled=!0,r.textContent=a,await vn(n),s.remove(),await t()}catch(e){r.disabled=!1,r.textContent=i,l.textContent=e.message||`访问密码错误`,l.style.display=`block`}})}export{v as $,dt as A,Ce as B,st as C,yt as D,ct as E,tt as F,A as G,he as H,qe as I,ie as J,j as K,be as L,rt as M,Je as N,ht as O,Ke as P,te as Q,we as R,ut as S,lt as T,oe as U,_e as V,O as W,m as X,w as Y,h as Z,St as _,Q as a,l as at,B as b,Gt as c,U as d,f as et,H as f,at as g,it as h,ta as i,u as it,xt as j,vt as k,tn as l,wt as m,wa as n,o as nt,ln as o,Tt as p,ae as q,Ca as r,s as rt,un as s,Ta as t,d as tt,Dt as u,mt as v,_t as w,V as x,Ct as y,xe as z};