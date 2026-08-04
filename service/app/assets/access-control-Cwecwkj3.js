var e=Object.create,t=Object.defineProperty,n=Object.getOwnPropertyDescriptor,r=Object.getOwnPropertyNames,i=Object.getPrototypeOf,a=Object.prototype.hasOwnProperty,o=(e,t)=>()=>(t||(e((t={exports:{}}).exports,t),e=null),t.exports),s=(e,n)=>{let r={};for(var i in e)t(r,i,{get:e[i],enumerable:!0});return n||t(r,Symbol.toStringTag,{value:`Module`}),r},c=(e,i,o,s)=>{if(i&&typeof i==`object`||typeof i==`function`)for(var c=r(i),l=0,u=c.length,d;l<u;l++)d=c[l],!a.call(e,d)&&d!==o&&t(e,d,{get:(e=>i[e]).bind(null,d),enumerable:!(s=n(i,d))||s.enumerable});return e},l=(n,r,a)=>(a=n==null?{}:e(i(n)),c(r||!n||!n.__esModule?t(a,`default`,{value:n,enumerable:!0}):a,n)),u=(e=>typeof require<`u`?require:typeof Proxy<`u`?new Proxy(e,{get:(e,t)=>(typeof require<`u`?require:e)[t]}):e)(function(e){if(typeof require<`u`)return require.apply(this,arguments);throw Error('Calling `require` for "'+e+"\" in an environment that doesn't expose the `require` function. See https://rolldown.rs/in-depth/bundling-cjs#require-external-modules for more details.")});(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),e.crossOrigin===`use-credentials`?t.credentials=`include`:e.crossOrigin===`anonymous`?t.credentials=`omit`:t.credentials=`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var d=o(((e,t)=>{(function(n,r){typeof e==`object`&&t!==void 0?t.exports=r():typeof define==`function`&&define.amd?define(r):(n||=self,n.AMapLoader=r())})(e,function(){function e(e){var r=[];return e.AMapUI&&r.push(t(e.AMapUI)),e.Loca&&r.push(n(e.Loca)),Promise.all(r)}function t(e){return new Promise(function(t,n){var s=[];if(e.plugins)for(var c=0;c<e.plugins.length;c+=1)i.AMapUI.plugins.indexOf(e.plugins[c])==-1&&s.push(e.plugins[c]);if(a.AMapUI===r.failed)n(`前次请求 AMapUI 失败`);else if(a.AMapUI===r.notload){a.AMapUI=r.loading,i.AMapUI.version=e.version||i.AMapUI.version,c=i.AMapUI.version;var l=document.body||document.head,u=document.createElement(`script`);u.type=`text/javascript`,u.src=`https://webapi.amap.com/ui/`+c+`/main.js`,u.onerror=function(e){a.AMapUI=r.failed,n(`请求 AMapUI 失败`)},u.onload=function(){if(a.AMapUI=r.loaded,s.length)window.AMapUI.loadUI(s,function(){for(var e=0,n=s.length;e<n;e++){var r=s[e].split(`/`).slice(-1)[0];window.AMapUI[r]=arguments[e]}for(t();o.AMapUI.length;)o.AMapUI.splice(0,1)[0]()});else for(t();o.AMapUI.length;)o.AMapUI.splice(0,1)[0]()},l.appendChild(u)}else a.AMapUI===r.loaded?e.version&&e.version!==i.AMapUI.version?n(`不允许多个版本 AMapUI 混用`):s.length?window.AMapUI.loadUI(s,function(){for(var e=0,n=s.length;e<n;e++){var r=s[e].split(`/`).slice(-1)[0];window.AMapUI[r]=arguments[e]}t()}):t():e.version&&e.version!==i.AMapUI.version?n(`不允许多个版本 AMapUI 混用`):o.AMapUI.push(function(e){e?n(e):s.length?window.AMapUI.loadUI(s,function(){for(var e=0,n=s.length;e<n;e++){var r=s[e].split(`/`).slice(-1)[0];window.AMapUI[r]=arguments[e]}t()}):t()})})}function n(e){return new Promise(function(t,n){if(a.Loca===r.failed)n(`前次请求 Loca 失败`);else if(a.Loca===r.notload){a.Loca=r.loading,i.Loca.version=e.version||i.Loca.version;var s=i.Loca.version,c=i.AMap.version.startsWith(`2`),l=s.startsWith(`2`);if(c&&!l||!c&&l)n(`JSAPI 与 Loca 版本不对应！！`);else{c=i.key,l=document.body||document.head;var u=document.createElement(`script`);u.type=`text/javascript`,u.src=`https://webapi.amap.com/loca?v=`+s+`&key=`+c,u.onerror=function(e){a.Loca=r.failed,n(`请求 AMapUI 失败`)},u.onload=function(){for(a.Loca=r.loaded,t();o.Loca.length;)o.Loca.splice(0,1)[0]()},l.appendChild(u)}}else a.Loca===r.loaded?e.version&&e.version!==i.Loca.version?n(`不允许多个版本 Loca 混用`):t():e.version&&e.version!==i.Loca.version?n(`不允许多个版本 Loca 混用`):o.Loca.push(function(e){e?n(e):n()})})}if(!window)throw Error(`AMap JSAPI can only be used in Browser.`);var r;(function(e){e.notload=`notload`,e.loading=`loading`,e.loaded=`loaded`,e.failed=`failed`})(r||={});var i={key:``,AMap:{version:`1.4.15`,plugins:[]},AMapUI:{version:`1.1`,plugins:[]},Loca:{version:`1.3.2`}},a={AMap:r.notload,AMapUI:r.notload,Loca:r.notload},o={AMap:[],AMapUI:[],Loca:[]},s=[],c=function(e){typeof e==`function`&&(a.AMap===r.loaded?e(window.AMap):s.push(e))};return{load:function(t){return new Promise(function(n,o){if(a.AMap==r.failed)o(``);else if(a.AMap==r.notload){var l=t.key,u=t.version,d=t.plugins;l?(window.AMap&&location.host!==`lbs.amap.com`&&o(`禁止多种API加载方式混用`),i.key=l,i.AMap.version=u||i.AMap.version,i.AMap.plugins=d||i.AMap.plugins,a.AMap=r.loading,u=document.body||document.head,window.___onAPILoaded=function(i){if(delete window.___onAPILoaded,i)a.AMap=r.failed,o(i);else for(a.AMap=r.loaded,e(t).then(function(){n(window.AMap)}).catch(o);s.length;)s.splice(0,1)[0]()},d=document.createElement(`script`),d.type=`text/javascript`,d.src=`https://webapi.amap.com/maps?callback=___onAPILoaded&v=`+i.AMap.version+`&key=`+l+`&plugin=`+i.AMap.plugins.join(`,`),d.onerror=function(e){a.AMap=r.failed,o(e)},u.appendChild(d)):o(`请填写key`)}else if(a.AMap==r.loaded)if(t.key&&t.key!==i.key)o(`多个不一致的 key`);else if(t.version&&t.version!==i.AMap.version)o(`不允许多个版本 JSAPI 混用`);else{if(l=[],t.plugins)for(u=0;u<t.plugins.length;u+=1)i.AMap.plugins.indexOf(t.plugins[u])==-1&&l.push(t.plugins[u]);l.length?window.AMap.plugin(l,function(){e(t).then(function(){n(window.AMap)}).catch(o)}):e(t).then(function(){n(window.AMap)}).catch(o)}else if(t.key&&t.key!==i.key)o(`多个不一致的 key`);else if(t.version&&t.version!==i.AMap.version)o(`不允许多个版本 JSAPI 混用`);else{var f=[];if(t.plugins)for(u=0;u<t.plugins.length;u+=1)i.AMap.plugins.indexOf(t.plugins[u])==-1&&f.push(t.plugins[u]);c(function(){f.length?window.AMap.plugin(f,function(){e(t).then(function(){n(window.AMap)}).catch(o)}):e(t).then(function(){n(window.AMap)}).catch(o)})}})},reset:function(){delete window.AMap,delete window.AMapUI,delete window.Loca,i={key:``,AMap:{version:`1.4.15`,plugins:[]},AMapUI:{version:`1.1`,plugins:[]},Loca:{version:`1.3.2`}},a={AMap:r.notload,AMapUI:r.notload,Loca:r.notload},o={AMap:[],AMapUI:[],Loca:[]}}}})})),f=o(((e,t)=>{(function(n,r){typeof e==`object`&&t!==void 0?r(e):typeof define==`function`&&define.amd?define([`exports`],r):(n=typeof globalThis<`u`?globalThis:n||self,r(n.leaflet={}))})(e,(function(e){var t=`1.9.4`;function n(e){var t,n,r,i;for(n=1,r=arguments.length;n<r;n++)for(t in i=arguments[n],i)e[t]=i[t];return e}var r=Object.create||(function(){function e(){}return function(t){return e.prototype=t,new e}})();function i(e,t){var n=Array.prototype.slice;if(e.bind)return e.bind.apply(e,n.call(arguments,1));var r=n.call(arguments,2);return function(){return e.apply(t,r.length?r.concat(n.call(arguments)):arguments)}}var a=0;function o(e){return`_leaflet_id`in e||(e._leaflet_id=++a),e._leaflet_id}function s(e,t,n){var r,i,a,o=function(){r=!1,i&&=(a.apply(n,i),!1)};return a=function(){r?i=arguments:(e.apply(n,arguments),setTimeout(o,t),r=!0)},a}function c(e,t,n){var r=t[1],i=t[0],a=r-i;return e===r&&n?e:((e-i)%a+a)%a+i}function l(){return!1}function u(e,t){if(t===!1)return e;var n=10**(t===void 0?6:t);return Math.round(e*n)/n}function d(e){return e.trim?e.trim():e.replace(/^\s+|\s+$/g,``)}function f(e){return d(e).split(/\s+/)}function p(e,t){for(var n in Object.prototype.hasOwnProperty.call(e,`options`)||(e.options=e.options?r(e.options):{}),t)e.options[n]=t[n];return e.options}function m(e,t,n){var r=[];for(var i in e)r.push(encodeURIComponent(n?i.toUpperCase():i)+`=`+encodeURIComponent(e[i]));return(!t||t.indexOf(`?`)===-1?`?`:`&`)+r.join(`&`)}var h=/\{ *([\w_ -]+) *\}/g;function g(e,t){return e.replace(h,function(e,n){var r=t[n];if(r===void 0)throw Error(`No value provided for variable `+e);return typeof r==`function`&&(r=r(t)),r})}var _=Array.isArray||function(e){return Object.prototype.toString.call(e)===`[object Array]`};function ee(e,t){for(var n=0;n<e.length;n++)if(e[n]===t)return n;return-1}var te=`data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=`;function v(e){return window[`webkit`+e]||window[`moz`+e]||window[`ms`+e]}var ne=0;function re(e){var t=+new Date,n=Math.max(0,16-(t-ne));return ne=t+n,window.setTimeout(e,n)}var y=window.requestAnimationFrame||v(`RequestAnimationFrame`)||re,b=window.cancelAnimationFrame||v(`CancelAnimationFrame`)||v(`CancelRequestAnimationFrame`)||function(e){window.clearTimeout(e)};function x(e,t,n){if(n&&y===re)e.call(t);else return y.call(window,i(e,t))}function S(e){e&&b.call(window,e)}var ie={__proto__:null,extend:n,create:r,bind:i,get lastId(){return a},stamp:o,throttle:s,wrapNum:c,falseFn:l,formatNum:u,trim:d,splitWords:f,setOptions:p,getParamString:m,template:g,isArray:_,indexOf:ee,emptyImageUrl:te,requestFn:y,cancelFn:b,requestAnimFrame:x,cancelAnimFrame:S};function C(){}C.extend=function(e){var t=function(){p(this),this.initialize&&this.initialize.apply(this,arguments),this.callInitHooks()},i=t.__super__=this.prototype,a=r(i);for(var o in a.constructor=t,t.prototype=a,this)Object.prototype.hasOwnProperty.call(this,o)&&o!==`prototype`&&o!==`__super__`&&(t[o]=this[o]);return e.statics&&n(t,e.statics),e.includes&&(ae(e.includes),n.apply(null,[a].concat(e.includes))),n(a,e),delete a.statics,delete a.includes,a.options&&(a.options=i.options?r(i.options):{},n(a.options,e.options)),a._initHooks=[],a.callInitHooks=function(){if(!this._initHooksCalled){i.callInitHooks&&i.callInitHooks.call(this),this._initHooksCalled=!0;for(var e=0,t=a._initHooks.length;e<t;e++)a._initHooks[e].call(this)}},t},C.include=function(e){var t=this.prototype.options;return n(this.prototype,e),e.options&&(this.prototype.options=t,this.mergeOptions(e.options)),this},C.mergeOptions=function(e){return n(this.prototype.options,e),this},C.addInitHook=function(e){var t=Array.prototype.slice.call(arguments,1),n=typeof e==`function`?e:function(){this[e].apply(this,t)};return this.prototype._initHooks=this.prototype._initHooks||[],this.prototype._initHooks.push(n),this};function ae(e){if(!(typeof L>`u`||!L||!L.Mixin)){e=_(e)?e:[e];for(var t=0;t<e.length;t++)e[t]===L.Mixin.Events&&console.warn(`Deprecated include of L.Mixin.Events: this property will be removed in future releases, please inherit from L.Evented instead.`,Error().stack)}}var w={on:function(e,t,n){if(typeof e==`object`)for(var r in e)this._on(r,e[r],t);else{e=f(e);for(var i=0,a=e.length;i<a;i++)this._on(e[i],t,n)}return this},off:function(e,t,n){if(!arguments.length)delete this._events;else if(typeof e==`object`)for(var r in e)this._off(r,e[r],t);else{e=f(e);for(var i=arguments.length===1,a=0,o=e.length;a<o;a++)i?this._off(e[a]):this._off(e[a],t,n)}return this},_on:function(e,t,n,r){if(typeof t!=`function`){console.warn(`wrong listener type: `+typeof t);return}if(this._listens(e,t,n)===!1){n===this&&(n=void 0);var i={fn:t,ctx:n};r&&(i.once=!0),this._events=this._events||{},this._events[e]=this._events[e]||[],this._events[e].push(i)}},_off:function(e,t,n){var r,i,a;if(this._events&&(r=this._events[e],r)){if(arguments.length===1){if(this._firingCount)for(i=0,a=r.length;i<a;i++)r[i].fn=l;delete this._events[e];return}if(typeof t!=`function`){console.warn(`wrong listener type: `+typeof t);return}var o=this._listens(e,t,n);if(o!==!1){var s=r[o];this._firingCount&&(s.fn=l,this._events[e]=r=r.slice()),r.splice(o,1)}}},fire:function(e,t,r){if(!this.listens(e,r))return this;var i=n({},t,{type:e,target:this,sourceTarget:t&&t.sourceTarget||this});if(this._events){var a=this._events[e];if(a){this._firingCount=this._firingCount+1||1;for(var o=0,s=a.length;o<s;o++){var c=a[o],l=c.fn;c.once&&this.off(e,l,c.ctx),l.call(c.ctx||this,i)}this._firingCount--}}return r&&this._propagateEvent(i),this},listens:function(e,t,n,r){typeof e!=`string`&&console.warn(`"string" type argument expected`);var i=t;typeof t!=`function`&&(r=!!t,i=void 0,n=void 0);var a=this._events&&this._events[e];if(a&&a.length&&this._listens(e,i,n)!==!1)return!0;if(r){for(var o in this._eventParents)if(this._eventParents[o].listens(e,t,n,r))return!0}return!1},_listens:function(e,t,n){if(!this._events)return!1;var r=this._events[e]||[];if(!t)return!!r.length;n===this&&(n=void 0);for(var i=0,a=r.length;i<a;i++)if(r[i].fn===t&&r[i].ctx===n)return i;return!1},once:function(e,t,n){if(typeof e==`object`)for(var r in e)this._on(r,e[r],t,!0);else{e=f(e);for(var i=0,a=e.length;i<a;i++)this._on(e[i],t,n,!0)}return this},addEventParent:function(e){return this._eventParents=this._eventParents||{},this._eventParents[o(e)]=e,this},removeEventParent:function(e){return this._eventParents&&delete this._eventParents[o(e)],this},_propagateEvent:function(e){for(var t in this._eventParents)this._eventParents[t].fire(e.type,n({layer:e.target,propagatedFrom:e.target},e),!0)}};w.addEventListener=w.on,w.removeEventListener=w.clearAllEventListeners=w.off,w.addOneTimeEventListener=w.once,w.fireEvent=w.fire,w.hasEventListeners=w.listens;var T=C.extend(w);function E(e,t,n){this.x=n?Math.round(e):e,this.y=n?Math.round(t):t}var oe=Math.trunc||function(e){return e>0?Math.floor(e):Math.ceil(e)};E.prototype={clone:function(){return new E(this.x,this.y)},add:function(e){return this.clone()._add(D(e))},_add:function(e){return this.x+=e.x,this.y+=e.y,this},subtract:function(e){return this.clone()._subtract(D(e))},_subtract:function(e){return this.x-=e.x,this.y-=e.y,this},divideBy:function(e){return this.clone()._divideBy(e)},_divideBy:function(e){return this.x/=e,this.y/=e,this},multiplyBy:function(e){return this.clone()._multiplyBy(e)},_multiplyBy:function(e){return this.x*=e,this.y*=e,this},scaleBy:function(e){return new E(this.x*e.x,this.y*e.y)},unscaleBy:function(e){return new E(this.x/e.x,this.y/e.y)},round:function(){return this.clone()._round()},_round:function(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this},floor:function(){return this.clone()._floor()},_floor:function(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this},ceil:function(){return this.clone()._ceil()},_ceil:function(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this},trunc:function(){return this.clone()._trunc()},_trunc:function(){return this.x=oe(this.x),this.y=oe(this.y),this},distanceTo:function(e){e=D(e);var t=e.x-this.x,n=e.y-this.y;return Math.sqrt(t*t+n*n)},equals:function(e){return e=D(e),e.x===this.x&&e.y===this.y},contains:function(e){return e=D(e),Math.abs(e.x)<=Math.abs(this.x)&&Math.abs(e.y)<=Math.abs(this.y)},toString:function(){return`Point(`+u(this.x)+`, `+u(this.y)+`)`}};function D(e,t,n){return e instanceof E?e:_(e)?new E(e[0],e[1]):e==null?e:typeof e==`object`&&`x`in e&&`y`in e?new E(e.x,e.y):new E(e,t,n)}function O(e,t){if(e)for(var n=t?[e,t]:e,r=0,i=n.length;r<i;r++)this.extend(n[r])}O.prototype={extend:function(e){var t,n;if(!e)return this;if(e instanceof E||typeof e[0]==`number`||`x`in e)t=n=D(e);else if(e=k(e),t=e.min,n=e.max,!t||!n)return this;return!this.min&&!this.max?(this.min=t.clone(),this.max=n.clone()):(this.min.x=Math.min(t.x,this.min.x),this.max.x=Math.max(n.x,this.max.x),this.min.y=Math.min(t.y,this.min.y),this.max.y=Math.max(n.y,this.max.y)),this},getCenter:function(e){return D((this.min.x+this.max.x)/2,(this.min.y+this.max.y)/2,e)},getBottomLeft:function(){return D(this.min.x,this.max.y)},getTopRight:function(){return D(this.max.x,this.min.y)},getTopLeft:function(){return this.min},getBottomRight:function(){return this.max},getSize:function(){return this.max.subtract(this.min)},contains:function(e){var t,n;return e=typeof e[0]==`number`||e instanceof E?D(e):k(e),e instanceof O?(t=e.min,n=e.max):t=n=e,t.x>=this.min.x&&n.x<=this.max.x&&t.y>=this.min.y&&n.y<=this.max.y},intersects:function(e){e=k(e);var t=this.min,n=this.max,r=e.min,i=e.max,a=i.x>=t.x&&r.x<=n.x,o=i.y>=t.y&&r.y<=n.y;return a&&o},overlaps:function(e){e=k(e);var t=this.min,n=this.max,r=e.min,i=e.max,a=i.x>t.x&&r.x<n.x,o=i.y>t.y&&r.y<n.y;return a&&o},isValid:function(){return!!(this.min&&this.max)},pad:function(e){var t=this.min,n=this.max,r=Math.abs(t.x-n.x)*e,i=Math.abs(t.y-n.y)*e;return k(D(t.x-r,t.y-i),D(n.x+r,n.y+i))},equals:function(e){return e?(e=k(e),this.min.equals(e.getTopLeft())&&this.max.equals(e.getBottomRight())):!1}};function k(e,t){return!e||e instanceof O?e:new O(e,t)}function A(e,t){if(e)for(var n=t?[e,t]:e,r=0,i=n.length;r<i;r++)this.extend(n[r])}A.prototype={extend:function(e){var t=this._southWest,n=this._northEast,r,i;if(e instanceof M)r=e,i=e;else if(e instanceof A){if(r=e._southWest,i=e._northEast,!r||!i)return this}else return e?this.extend(N(e)||j(e)):this;return!t&&!n?(this._southWest=new M(r.lat,r.lng),this._northEast=new M(i.lat,i.lng)):(t.lat=Math.min(r.lat,t.lat),t.lng=Math.min(r.lng,t.lng),n.lat=Math.max(i.lat,n.lat),n.lng=Math.max(i.lng,n.lng)),this},pad:function(e){var t=this._southWest,n=this._northEast,r=Math.abs(t.lat-n.lat)*e,i=Math.abs(t.lng-n.lng)*e;return new A(new M(t.lat-r,t.lng-i),new M(n.lat+r,n.lng+i))},getCenter:function(){return new M((this._southWest.lat+this._northEast.lat)/2,(this._southWest.lng+this._northEast.lng)/2)},getSouthWest:function(){return this._southWest},getNorthEast:function(){return this._northEast},getNorthWest:function(){return new M(this.getNorth(),this.getWest())},getSouthEast:function(){return new M(this.getSouth(),this.getEast())},getWest:function(){return this._southWest.lng},getSouth:function(){return this._southWest.lat},getEast:function(){return this._northEast.lng},getNorth:function(){return this._northEast.lat},contains:function(e){e=typeof e[0]==`number`||e instanceof M||`lat`in e?N(e):j(e);var t=this._southWest,n=this._northEast,r,i;return e instanceof A?(r=e.getSouthWest(),i=e.getNorthEast()):r=i=e,r.lat>=t.lat&&i.lat<=n.lat&&r.lng>=t.lng&&i.lng<=n.lng},intersects:function(e){e=j(e);var t=this._southWest,n=this._northEast,r=e.getSouthWest(),i=e.getNorthEast(),a=i.lat>=t.lat&&r.lat<=n.lat,o=i.lng>=t.lng&&r.lng<=n.lng;return a&&o},overlaps:function(e){e=j(e);var t=this._southWest,n=this._northEast,r=e.getSouthWest(),i=e.getNorthEast(),a=i.lat>t.lat&&r.lat<n.lat,o=i.lng>t.lng&&r.lng<n.lng;return a&&o},toBBoxString:function(){return[this.getWest(),this.getSouth(),this.getEast(),this.getNorth()].join(`,`)},equals:function(e,t){return e?(e=j(e),this._southWest.equals(e.getSouthWest(),t)&&this._northEast.equals(e.getNorthEast(),t)):!1},isValid:function(){return!!(this._southWest&&this._northEast)}};function j(e,t){return e instanceof A?e:new A(e,t)}function M(e,t,n){if(isNaN(e)||isNaN(t))throw Error(`Invalid LatLng object: (`+e+`, `+t+`)`);this.lat=+e,this.lng=+t,n!==void 0&&(this.alt=+n)}M.prototype={equals:function(e,t){return e?(e=N(e),Math.max(Math.abs(this.lat-e.lat),Math.abs(this.lng-e.lng))<=(t===void 0?1e-9:t)):!1},toString:function(e){return`LatLng(`+u(this.lat,e)+`, `+u(this.lng,e)+`)`},distanceTo:function(e){return P.distance(this,N(e))},wrap:function(){return P.wrapLatLng(this)},toBounds:function(e){var t=180*e/40075017,n=t/Math.cos(Math.PI/180*this.lat);return j([this.lat-t,this.lng-n],[this.lat+t,this.lng+n])},clone:function(){return new M(this.lat,this.lng,this.alt)}};function N(e,t,n){return e instanceof M?e:_(e)&&typeof e[0]!=`object`?e.length===3?new M(e[0],e[1],e[2]):e.length===2?new M(e[0],e[1]):null:e==null?e:typeof e==`object`&&`lat`in e?new M(e.lat,`lng`in e?e.lng:e.lon,e.alt):t===void 0?null:new M(e,t,n)}var se={latLngToPoint:function(e,t){var n=this.projection.project(e),r=this.scale(t);return this.transformation._transform(n,r)},pointToLatLng:function(e,t){var n=this.scale(t),r=this.transformation.untransform(e,n);return this.projection.unproject(r)},project:function(e){return this.projection.project(e)},unproject:function(e){return this.projection.unproject(e)},scale:function(e){return 256*2**e},zoom:function(e){return Math.log(e/256)/Math.LN2},getProjectedBounds:function(e){if(this.infinite)return null;var t=this.projection.bounds,n=this.scale(e);return new O(this.transformation.transform(t.min,n),this.transformation.transform(t.max,n))},infinite:!1,wrapLatLng:function(e){var t=this.wrapLng?c(e.lng,this.wrapLng,!0):e.lng,n=this.wrapLat?c(e.lat,this.wrapLat,!0):e.lat,r=e.alt;return new M(n,t,r)},wrapLatLngBounds:function(e){var t=e.getCenter(),n=this.wrapLatLng(t),r=t.lat-n.lat,i=t.lng-n.lng;if(r===0&&i===0)return e;var a=e.getSouthWest(),o=e.getNorthEast();return new A(new M(a.lat-r,a.lng-i),new M(o.lat-r,o.lng-i))}},P=n({},se,{wrapLng:[-180,180],R:6371e3,distance:function(e,t){var n=Math.PI/180,r=e.lat*n,i=t.lat*n,a=Math.sin((t.lat-e.lat)*n/2),o=Math.sin((t.lng-e.lng)*n/2),s=a*a+Math.cos(r)*Math.cos(i)*o*o,c=2*Math.atan2(Math.sqrt(s),Math.sqrt(1-s));return this.R*c}}),ce=6378137,le={R:ce,MAX_LATITUDE:85.0511287798,project:function(e){var t=Math.PI/180,n=this.MAX_LATITUDE,r=Math.max(Math.min(n,e.lat),-n),i=Math.sin(r*t);return new E(this.R*e.lng*t,this.R*Math.log((1+i)/(1-i))/2)},unproject:function(e){var t=180/Math.PI;return new M((2*Math.atan(Math.exp(e.y/this.R))-Math.PI/2)*t,e.x*t/this.R)},bounds:(function(){var e=ce*Math.PI;return new O([-e,-e],[e,e])})()};function ue(e,t,n,r){if(_(e)){this._a=e[0],this._b=e[1],this._c=e[2],this._d=e[3];return}this._a=e,this._b=t,this._c=n,this._d=r}ue.prototype={transform:function(e,t){return this._transform(e.clone(),t)},_transform:function(e,t){return t||=1,e.x=t*(this._a*e.x+this._b),e.y=t*(this._c*e.y+this._d),e},untransform:function(e,t){return t||=1,new E((e.x/t-this._b)/this._a,(e.y/t-this._d)/this._c)}};function de(e,t,n,r){return new ue(e,t,n,r)}var fe=n({},P,{code:`EPSG:3857`,projection:le,transformation:function(){var e=.5/(Math.PI*le.R);return de(e,.5,-e,.5)}()}),pe=n({},fe,{code:`EPSG:900913`});function me(e){return document.createElementNS(`http://www.w3.org/2000/svg`,e)}function he(e,t){var n=``,r,i,a,o,s,c;for(r=0,a=e.length;r<a;r++){for(s=e[r],i=0,o=s.length;i<o;i++)c=s[i],n+=(i?`L`:`M`)+c.x+` `+c.y;n+=t?R.svg?`z`:`x`:``}return n||`M0 0`}var ge=document.documentElement.style,_e=`ActiveXObject`in window,ve=_e&&!document.addEventListener,ye=`msLaunchUri`in navigator&&!(`documentMode`in document),be=Ze(`webkit`),F=Ze(`android`),xe=Ze(`android 2`)||Ze(`android 3`),Se=parseInt(/WebKit\/([0-9]+)|$/.exec(navigator.userAgent)[1],10),Ce=F&&Ze(`Google`)&&Se<537&&!(`AudioNode`in window),we=!!window.opera,Te=!ye&&Ze(`chrome`),Ee=Ze(`gecko`)&&!be&&!we&&!_e,De=!Te&&Ze(`safari`),Oe=Ze(`phantom`),ke=`OTransition`in ge,Ae=navigator.platform.indexOf(`Win`)===0,je=_e&&`transition`in ge,Me=`WebKitCSSMatrix`in window&&`m11`in new window.WebKitCSSMatrix&&!xe,Ne=`MozPerspective`in ge,Pe=!window.L_DISABLE_3D&&(je||Me||Ne)&&!ke&&!Oe,Fe=typeof orientation<`u`||Ze(`mobile`),Ie=Fe&&be,Le=Fe&&Me,Re=!window.PointerEvent&&window.MSPointerEvent,ze=!!(window.PointerEvent||Re),Be=`ontouchstart`in window||!!window.TouchEvent,I=!window.L_NO_TOUCH&&(Be||ze),Ve=Fe&&we,He=Fe&&Ee,Ue=(window.devicePixelRatio||window.screen.deviceXDPI/window.screen.logicalXDPI)>1,We=function(){var e=!1;try{var t=Object.defineProperty({},"passive",{get:function(){e=!0}});window.addEventListener(`testPassiveEventSupport`,l,t),window.removeEventListener(`testPassiveEventSupport`,l,t)}catch{}return e}(),Ge=function(){return!!document.createElement(`canvas`).getContext}(),Ke=!!(document.createElementNS&&me(`svg`).createSVGRect),qe=!!Ke&&(function(){var e=document.createElement(`div`);return e.innerHTML=`<svg/>`,(e.firstChild&&e.firstChild.namespaceURI)===`http://www.w3.org/2000/svg`})(),Je=!Ke&&function(){try{var e=document.createElement(`div`);e.innerHTML=`<v:shape adj="1"/>`;var t=e.firstChild;return t.style.behavior=`url(#default#VML)`,t&&typeof t.adj==`object`}catch{return!1}}(),Ye=navigator.platform.indexOf(`Mac`)===0,Xe=navigator.platform.indexOf(`Linux`)===0;function Ze(e){return navigator.userAgent.toLowerCase().indexOf(e)>=0}var R={ie:_e,ielt9:ve,edge:ye,webkit:be,android:F,android23:xe,androidStock:Ce,opera:we,chrome:Te,gecko:Ee,safari:De,phantom:Oe,opera12:ke,win:Ae,ie3d:je,webkit3d:Me,gecko3d:Ne,any3d:Pe,mobile:Fe,mobileWebkit:Ie,mobileWebkit3d:Le,msPointer:Re,pointer:ze,touch:I,touchNative:Be,mobileOpera:Ve,mobileGecko:He,retina:Ue,passiveEvents:We,canvas:Ge,svg:Ke,vml:Je,inlineSvg:qe,mac:Ye,linux:Xe},Qe=R.msPointer?`MSPointerDown`:`pointerdown`,$e=R.msPointer?`MSPointerMove`:`pointermove`,et=R.msPointer?`MSPointerUp`:`pointerup`,tt=R.msPointer?`MSPointerCancel`:`pointercancel`,nt={touchstart:Qe,touchmove:$e,touchend:et,touchcancel:tt},rt={touchstart:pt,touchmove:ft,touchend:ft,touchcancel:ft},it={},at=!1;function ot(e,t,n){return t===`touchstart`&&dt(),rt[t]?(n=rt[t].bind(this,n),e.addEventListener(nt[t],n,!1),n):(console.warn(`wrong event specified:`,t),l)}function st(e,t,n){if(!nt[t]){console.warn(`wrong event specified:`,t);return}e.removeEventListener(nt[t],n,!1)}function ct(e){it[e.pointerId]=e}function lt(e){it[e.pointerId]&&(it[e.pointerId]=e)}function ut(e){delete it[e.pointerId]}function dt(){at||=(document.addEventListener(Qe,ct,!0),document.addEventListener($e,lt,!0),document.addEventListener(et,ut,!0),document.addEventListener(tt,ut,!0),!0)}function ft(e,t){if(t.pointerType!==(t.MSPOINTER_TYPE_MOUSE||`mouse`)){for(var n in t.touches=[],it)t.touches.push(it[n]);t.changedTouches=[t],e(t)}}function pt(e,t){t.MSPOINTER_TYPE_TOUCH&&t.pointerType===t.MSPOINTER_TYPE_TOUCH&&tn(t),ft(e,t)}function mt(e){var t={},n,r;for(r in e)n=e[r],t[r]=n&&n.bind?n.bind(e):n;return e=t,t.type=`dblclick`,t.detail=2,t.isTrusted=!1,t._simulated=!0,t}var ht=200;function gt(e,t){e.addEventListener(`dblclick`,t);var n=0,r;function i(e){if(e.detail!==1){r=e.detail;return}if(!(e.pointerType===`mouse`||e.sourceCapabilities&&!e.sourceCapabilities.firesTouchEvents)){var i=rn(e);if(!(i.some(function(e){return e instanceof HTMLLabelElement&&e.attributes.for})&&!i.some(function(e){return e instanceof HTMLInputElement||e instanceof HTMLSelectElement}))){var a=Date.now();a-n<=ht?(r++,r===2&&t(mt(e))):r=1,n=a}}}return e.addEventListener(`click`,i),{dblclick:t,simDblclick:i}}function _t(e,t){e.removeEventListener(`dblclick`,t.dblclick),e.removeEventListener(`click`,t.simDblclick)}var vt=jt([`transform`,`webkitTransform`,`OTransform`,`MozTransform`,`msTransform`]),yt=jt([`webkitTransition`,`transition`,`OTransition`,`MozTransition`,`msTransition`]),bt=yt===`webkitTransition`||yt===`OTransition`?yt+`End`:`transitionend`;function xt(e){return typeof e==`string`?document.getElementById(e):e}function St(e,t){var n=e.style[t]||e.currentStyle&&e.currentStyle[t];if((!n||n===`auto`)&&document.defaultView){var r=document.defaultView.getComputedStyle(e,null);n=r?r[t]:null}return n===`auto`?null:n}function z(e,t,n){var r=document.createElement(e);return r.className=t||``,n&&n.appendChild(r),r}function B(e){var t=e.parentNode;t&&t.removeChild(e)}function Ct(e){for(;e.firstChild;)e.removeChild(e.firstChild)}function wt(e){var t=e.parentNode;t&&t.lastChild!==e&&t.appendChild(e)}function Tt(e){var t=e.parentNode;t&&t.firstChild!==e&&t.insertBefore(e,t.firstChild)}function Et(e,t){if(e.classList!==void 0)return e.classList.contains(t);var n=Ot(e);return n.length>0&&RegExp(`(^|\\s)`+t+`(\\s|$)`).test(n)}function V(e,t){if(e.classList!==void 0)for(var n=f(t),r=0,i=n.length;r<i;r++)e.classList.add(n[r]);else if(!Et(e,t)){var a=Ot(e);Dt(e,(a?a+` `:``)+t)}}function H(e,t){e.classList===void 0?Dt(e,d((` `+Ot(e)+` `).replace(` `+t+` `,` `))):e.classList.remove(t)}function Dt(e,t){e.className.baseVal===void 0?e.className=t:e.className.baseVal=t}function Ot(e){return e.correspondingElement&&(e=e.correspondingElement),e.className.baseVal===void 0?e.className:e.className.baseVal}function kt(e,t){`opacity`in e.style?e.style.opacity=t:`filter`in e.style&&At(e,t)}function At(e,t){var n=!1,r=`DXImageTransform.Microsoft.Alpha`;try{n=e.filters.item(r)}catch{if(t===1)return}t=Math.round(t*100),n?(n.Enabled=t!==100,n.Opacity=t):e.style.filter+=` progid:`+r+`(opacity=`+t+`)`}function jt(e){for(var t=document.documentElement.style,n=0;n<e.length;n++)if(e[n]in t)return e[n];return!1}function Mt(e,t,n){var r=t||new E(0,0);e.style[vt]=(R.ie3d?`translate(`+r.x+`px,`+r.y+`px)`:`translate3d(`+r.x+`px,`+r.y+`px,0)`)+(n?` scale(`+n+`)`:``)}function U(e,t){e._leaflet_pos=t,R.any3d?Mt(e,t):(e.style.left=t.x+`px`,e.style.top=t.y+`px`)}function Nt(e){return e._leaflet_pos||new E(0,0)}var Pt,Ft,It;if(`onselectstart`in document)Pt=function(){W(window,`selectstart`,tn)},Ft=function(){G(window,`selectstart`,tn)};else{var Lt=jt([`userSelect`,`WebkitUserSelect`,`OUserSelect`,`MozUserSelect`,`msUserSelect`]);Pt=function(){if(Lt){var e=document.documentElement.style;It=e[Lt],e[Lt]=`none`}},Ft=function(){Lt&&(document.documentElement.style[Lt]=It,It=void 0)}}function Rt(){W(window,`dragstart`,tn)}function zt(){G(window,`dragstart`,tn)}var Bt,Vt;function Ht(e){for(;e.tabIndex===-1;)e=e.parentNode;e.style&&(Ut(),Bt=e,Vt=e.style.outlineStyle,e.style.outlineStyle=`none`,W(window,`keydown`,Ut))}function Ut(){Bt&&(Bt.style.outlineStyle=Vt,Bt=void 0,Vt=void 0,G(window,`keydown`,Ut))}function Wt(e){do e=e.parentNode;while((!e.offsetWidth||!e.offsetHeight)&&e!==document.body);return e}function Gt(e){var t=e.getBoundingClientRect();return{x:t.width/e.offsetWidth||1,y:t.height/e.offsetHeight||1,boundingClientRect:t}}var Kt={__proto__:null,TRANSFORM:vt,TRANSITION:yt,TRANSITION_END:bt,get:xt,getStyle:St,create:z,remove:B,empty:Ct,toFront:wt,toBack:Tt,hasClass:Et,addClass:V,removeClass:H,setClass:Dt,getClass:Ot,setOpacity:kt,testProp:jt,setTransform:Mt,setPosition:U,getPosition:Nt,get disableTextSelection(){return Pt},get enableTextSelection(){return Ft},disableImageDrag:Rt,enableImageDrag:zt,preventOutline:Ht,restoreOutline:Ut,getSizedParentNode:Wt,getScale:Gt};function W(e,t,n,r){if(t&&typeof t==`object`)for(var i in t)Xt(e,i,t[i],n);else{t=f(t);for(var a=0,o=t.length;a<o;a++)Xt(e,t[a],n,r)}return this}var qt=`_leaflet_events`;function G(e,t,n,r){if(arguments.length===1)Jt(e),delete e[qt];else if(t&&typeof t==`object`)for(var i in t)Zt(e,i,t[i],n);else if(t=f(t),arguments.length===2)Jt(e,function(e){return ee(t,e)!==-1});else for(var a=0,o=t.length;a<o;a++)Zt(e,t[a],n,r);return this}function Jt(e,t){for(var n in e[qt]){var r=n.split(/\d/)[0];(!t||t(r))&&Zt(e,r,null,null,n)}}var Yt={mouseenter:`mouseover`,mouseleave:`mouseout`,wheel:!(`onwheel`in window)&&`mousewheel`};function Xt(e,t,n,r){var i=t+o(n)+(r?`_`+o(r):``);if(e[qt]&&e[qt][i])return this;var a=function(t){return n.call(r||e,t||window.event)},s=a;!R.touchNative&&R.pointer&&t.indexOf(`touch`)===0?a=ot(e,t,a):R.touch&&t===`dblclick`?a=gt(e,a):`addEventListener`in e?t===`touchstart`||t===`touchmove`||t===`wheel`||t===`mousewheel`?e.addEventListener(Yt[t]||t,a,R.passiveEvents?{passive:!1}:!1):t===`mouseenter`||t===`mouseleave`?(a=function(t){t||=window.event,cn(e,t)&&s(t)},e.addEventListener(Yt[t],a,!1)):e.addEventListener(t,s,!1):e.attachEvent(`on`+t,a),e[qt]=e[qt]||{},e[qt][i]=a}function Zt(e,t,n,r,i){i||=t+o(n)+(r?`_`+o(r):``);var a=e[qt]&&e[qt][i];if(!a)return this;!R.touchNative&&R.pointer&&t.indexOf(`touch`)===0?st(e,t,a):R.touch&&t===`dblclick`?_t(e,a):`removeEventListener`in e?e.removeEventListener(Yt[t]||t,a,!1):e.detachEvent(`on`+t,a),e[qt][i]=null}function Qt(e){return e.stopPropagation?e.stopPropagation():e.originalEvent?e.originalEvent._stopped=!0:e.cancelBubble=!0,this}function $t(e){return Xt(e,`wheel`,Qt),this}function en(e){return W(e,`mousedown touchstart dblclick contextmenu`,Qt),e._leaflet_disable_click=!0,this}function tn(e){return e.preventDefault?e.preventDefault():e.returnValue=!1,this}function nn(e){return tn(e),Qt(e),this}function rn(e){if(e.composedPath)return e.composedPath();for(var t=[],n=e.target;n;)t.push(n),n=n.parentNode;return t}function an(e,t){if(!t)return new E(e.clientX,e.clientY);var n=Gt(t),r=n.boundingClientRect;return new E((e.clientX-r.left)/n.x-t.clientLeft,(e.clientY-r.top)/n.y-t.clientTop)}var on=R.linux&&R.chrome?window.devicePixelRatio:R.mac?window.devicePixelRatio*3:window.devicePixelRatio>0?2*window.devicePixelRatio:1;function sn(e){return R.edge?e.wheelDeltaY/2:e.deltaY&&e.deltaMode===0?-e.deltaY/on:e.deltaY&&e.deltaMode===1?-e.deltaY*20:e.deltaY&&e.deltaMode===2?-e.deltaY*60:e.deltaX||e.deltaZ?0:e.wheelDelta?(e.wheelDeltaY||e.wheelDelta)/2:e.detail&&Math.abs(e.detail)<32765?-e.detail*20:e.detail?e.detail/-32765*60:0}function cn(e,t){var n=t.relatedTarget;if(!n)return!0;try{for(;n&&n!==e;)n=n.parentNode}catch{return!1}return n!==e}var ln={__proto__:null,on:W,off:G,stopPropagation:Qt,disableScrollPropagation:$t,disableClickPropagation:en,preventDefault:tn,stop:nn,getPropagationPath:rn,getMousePosition:an,getWheelDelta:sn,isExternalTarget:cn,addListener:W,removeListener:G},un=T.extend({run:function(e,t,n,r){this.stop(),this._el=e,this._inProgress=!0,this._duration=n||.25,this._easeOutPower=1/Math.max(r||.5,.2),this._startPos=Nt(e),this._offset=t.subtract(this._startPos),this._startTime=+new Date,this.fire(`start`),this._animate()},stop:function(){this._inProgress&&(this._step(!0),this._complete())},_animate:function(){this._animId=x(this._animate,this),this._step()},_step:function(e){var t=+new Date-this._startTime,n=this._duration*1e3;t<n?this._runFrame(this._easeOut(t/n),e):(this._runFrame(1),this._complete())},_runFrame:function(e,t){var n=this._startPos.add(this._offset.multiplyBy(e));t&&n._round(),U(this._el,n),this.fire(`step`)},_complete:function(){S(this._animId),this._inProgress=!1,this.fire(`end`)},_easeOut:function(e){return 1-(1-e)**this._easeOutPower}}),K=T.extend({options:{crs:fe,center:void 0,zoom:void 0,minZoom:void 0,maxZoom:void 0,layers:[],maxBounds:void 0,renderer:void 0,zoomAnimation:!0,zoomAnimationThreshold:4,fadeAnimation:!0,markerZoomAnimation:!0,transform3DLimit:8388608,zoomSnap:1,zoomDelta:1,trackResize:!0},initialize:function(e,t){t=p(this,t),this._handlers=[],this._layers={},this._zoomBoundLayers={},this._sizeChanged=!0,this._initContainer(e),this._initLayout(),this._onResize=i(this._onResize,this),this._initEvents(),t.maxBounds&&this.setMaxBounds(t.maxBounds),t.zoom!==void 0&&(this._zoom=this._limitZoom(t.zoom)),t.center&&t.zoom!==void 0&&this.setView(N(t.center),t.zoom,{reset:!0}),this.callInitHooks(),this._zoomAnimated=yt&&R.any3d&&!R.mobileOpera&&this.options.zoomAnimation,this._zoomAnimated&&(this._createAnimProxy(),W(this._proxy,bt,this._catchTransitionEnd,this)),this._addLayers(this.options.layers)},setView:function(e,t,r){return t=t===void 0?this._zoom:this._limitZoom(t),e=this._limitCenter(N(e),t,this.options.maxBounds),r||={},this._stop(),this._loaded&&!r.reset&&r!==!0&&(r.animate!==void 0&&(r.zoom=n({animate:r.animate},r.zoom),r.pan=n({animate:r.animate,duration:r.duration},r.pan)),this._zoom===t?this._tryAnimatedPan(e,r.pan):this._tryAnimatedZoom&&this._tryAnimatedZoom(e,t,r.zoom))?(clearTimeout(this._sizeTimer),this):(this._resetView(e,t,r.pan&&r.pan.noMoveStart),this)},setZoom:function(e,t){return this._loaded?this.setView(this.getCenter(),e,{zoom:t}):(this._zoom=e,this)},zoomIn:function(e,t){return e||=R.any3d?this.options.zoomDelta:1,this.setZoom(this._zoom+e,t)},zoomOut:function(e,t){return e||=R.any3d?this.options.zoomDelta:1,this.setZoom(this._zoom-e,t)},setZoomAround:function(e,t,n){var r=this.getZoomScale(t),i=this.getSize().divideBy(2),a=(e instanceof E?e:this.latLngToContainerPoint(e)).subtract(i).multiplyBy(1-1/r),o=this.containerPointToLatLng(i.add(a));return this.setView(o,t,{zoom:n})},_getBoundsCenterZoom:function(e,t){t||={},e=e.getBounds?e.getBounds():j(e);var n=D(t.paddingTopLeft||t.padding||[0,0]),r=D(t.paddingBottomRight||t.padding||[0,0]),i=this.getBoundsZoom(e,!1,n.add(r));if(i=typeof t.maxZoom==`number`?Math.min(t.maxZoom,i):i,i===1/0)return{center:e.getCenter(),zoom:i};var a=r.subtract(n).divideBy(2),o=this.project(e.getSouthWest(),i),s=this.project(e.getNorthEast(),i);return{center:this.unproject(o.add(s).divideBy(2).add(a),i),zoom:i}},fitBounds:function(e,t){if(e=j(e),!e.isValid())throw Error(`Bounds are not valid.`);var n=this._getBoundsCenterZoom(e,t);return this.setView(n.center,n.zoom,t)},fitWorld:function(e){return this.fitBounds([[-90,-180],[90,180]],e)},panTo:function(e,t){return this.setView(e,this._zoom,{pan:t})},panBy:function(e,t){if(e=D(e).round(),t||={},!e.x&&!e.y)return this.fire(`moveend`);if(t.animate!==!0&&!this.getSize().contains(e))return this._resetView(this.unproject(this.project(this.getCenter()).add(e)),this.getZoom()),this;if(this._panAnim||(this._panAnim=new un,this._panAnim.on({step:this._onPanTransitionStep,end:this._onPanTransitionEnd},this)),t.noMoveStart||this.fire(`movestart`),t.animate!==!1){V(this._mapPane,`leaflet-pan-anim`);var n=this._getMapPanePos().subtract(e).round();this._panAnim.run(this._mapPane,n,t.duration||.25,t.easeLinearity)}else this._rawPanBy(e),this.fire(`move`).fire(`moveend`);return this},flyTo:function(e,t,n){if(n||={},n.animate===!1||!R.any3d)return this.setView(e,t,n);this._stop();var r=this.project(this.getCenter()),i=this.project(e),a=this.getSize(),o=this._zoom;e=N(e),t=t===void 0?o:t;var s=Math.max(a.x,a.y),c=s*this.getZoomScale(o,t),l=i.distanceTo(r)||1,u=1.42,d=u*u;function f(e){var t=e?-1:1,n=e?c:s,r=(c*c-s*s+t*d*d*l*l)/(2*n*d*l),i=Math.sqrt(r*r+1)-r;return i<1e-9?-18:Math.log(i)}function p(e){return(Math.exp(e)-Math.exp(-e))/2}function m(e){return(Math.exp(e)+Math.exp(-e))/2}function h(e){return p(e)/m(e)}var g=f(0);function _(e){return s*(m(g)/m(g+u*e))}function ee(e){return s*(m(g)*h(g+u*e)-p(g))/d}function te(e){return 1-(1-e)**1.5}var v=Date.now(),ne=(f(1)-g)/u,re=n.duration?1e3*n.duration:1e3*ne*.8;function y(){var n=(Date.now()-v)/re,a=te(n)*ne;n<=1?(this._flyToFrame=x(y,this),this._move(this.unproject(r.add(i.subtract(r).multiplyBy(ee(a)/l)),o),this.getScaleZoom(s/_(a),o),{flyTo:!0})):this._move(e,t)._moveEnd(!0)}return this._moveStart(!0,n.noMoveStart),y.call(this),this},flyToBounds:function(e,t){var n=this._getBoundsCenterZoom(e,t);return this.flyTo(n.center,n.zoom,t)},setMaxBounds:function(e){return e=j(e),this.listens(`moveend`,this._panInsideMaxBounds)&&this.off(`moveend`,this._panInsideMaxBounds),e.isValid()?(this.options.maxBounds=e,this._loaded&&this._panInsideMaxBounds(),this.on(`moveend`,this._panInsideMaxBounds)):(this.options.maxBounds=null,this)},setMinZoom:function(e){var t=this.options.minZoom;return this.options.minZoom=e,this._loaded&&t!==e&&(this.fire(`zoomlevelschange`),this.getZoom()<this.options.minZoom)?this.setZoom(e):this},setMaxZoom:function(e){var t=this.options.maxZoom;return this.options.maxZoom=e,this._loaded&&t!==e&&(this.fire(`zoomlevelschange`),this.getZoom()>this.options.maxZoom)?this.setZoom(e):this},panInsideBounds:function(e,t){this._enforcingBounds=!0;var n=this.getCenter(),r=this._limitCenter(n,this._zoom,j(e));return n.equals(r)||this.panTo(r,t),this._enforcingBounds=!1,this},panInside:function(e,t){t||={};var n=D(t.paddingTopLeft||t.padding||[0,0]),r=D(t.paddingBottomRight||t.padding||[0,0]),i=this.project(this.getCenter()),a=this.project(e),o=this.getPixelBounds(),s=k([o.min.add(n),o.max.subtract(r)]),c=s.getSize();if(!s.contains(a)){this._enforcingBounds=!0;var l=a.subtract(s.getCenter()),u=s.extend(a).getSize().subtract(c);i.x+=l.x<0?-u.x:u.x,i.y+=l.y<0?-u.y:u.y,this.panTo(this.unproject(i),t),this._enforcingBounds=!1}return this},invalidateSize:function(e){if(!this._loaded)return this;e=n({animate:!1,pan:!0},e===!0?{animate:!0}:e);var t=this.getSize();this._sizeChanged=!0,this._lastCenter=null;var r=this.getSize(),a=t.divideBy(2).round(),o=r.divideBy(2).round(),s=a.subtract(o);return!s.x&&!s.y?this:(e.animate&&e.pan?this.panBy(s):(e.pan&&this._rawPanBy(s),this.fire(`move`),e.debounceMoveend?(clearTimeout(this._sizeTimer),this._sizeTimer=setTimeout(i(this.fire,this,`moveend`),200)):this.fire(`moveend`)),this.fire(`resize`,{oldSize:t,newSize:r}))},stop:function(){return this.setZoom(this._limitZoom(this._zoom)),this.options.zoomSnap||this.fire(`viewreset`),this._stop()},locate:function(e){if(e=this._locateOptions=n({timeout:1e4,watch:!1},e),!(`geolocation`in navigator))return this._handleGeolocationError({code:0,message:`Geolocation not supported.`}),this;var t=i(this._handleGeolocationResponse,this),r=i(this._handleGeolocationError,this);return e.watch?this._locationWatchId=navigator.geolocation.watchPosition(t,r,e):navigator.geolocation.getCurrentPosition(t,r,e),this},stopLocate:function(){return navigator.geolocation&&navigator.geolocation.clearWatch&&navigator.geolocation.clearWatch(this._locationWatchId),this._locateOptions&&(this._locateOptions.setView=!1),this},_handleGeolocationError:function(e){if(this._container._leaflet_id){var t=e.code,n=e.message||(t===1?`permission denied`:t===2?`position unavailable`:`timeout`);this._locateOptions.setView&&!this._loaded&&this.fitWorld(),this.fire(`locationerror`,{code:t,message:`Geolocation error: `+n+`.`})}},_handleGeolocationResponse:function(e){if(this._container._leaflet_id){var t=e.coords.latitude,n=e.coords.longitude,r=new M(t,n),i=r.toBounds(e.coords.accuracy*2),a=this._locateOptions;if(a.setView){var o=this.getBoundsZoom(i);this.setView(r,a.maxZoom?Math.min(o,a.maxZoom):o)}var s={latlng:r,bounds:i,timestamp:e.timestamp};for(var c in e.coords)typeof e.coords[c]==`number`&&(s[c]=e.coords[c]);this.fire(`locationfound`,s)}},addHandler:function(e,t){if(!t)return this;var n=this[e]=new t(this);return this._handlers.push(n),this.options[e]&&n.enable(),this},remove:function(){if(this._initEvents(!0),this.options.maxBounds&&this.off(`moveend`,this._panInsideMaxBounds),this._containerId!==this._container._leaflet_id)throw Error(`Map container is being reused by another instance`);try{delete this._container._leaflet_id,delete this._containerId}catch{this._container._leaflet_id=void 0,this._containerId=void 0}for(var e in this._locationWatchId!==void 0&&this.stopLocate(),this._stop(),B(this._mapPane),this._clearControlPos&&this._clearControlPos(),this._resizeRequest&&=(S(this._resizeRequest),null),this._clearHandlers(),this._loaded&&this.fire(`unload`),this._layers)this._layers[e].remove();for(e in this._panes)B(this._panes[e]);return this._layers=[],this._panes=[],delete this._mapPane,delete this._renderer,this},createPane:function(e,t){var n=z(`div`,`leaflet-pane`+(e?` leaflet-`+e.replace(`Pane`,``)+`-pane`:``),t||this._mapPane);return e&&(this._panes[e]=n),n},getCenter:function(){return this._checkIfLoaded(),this._lastCenter&&!this._moved()?this._lastCenter.clone():this.layerPointToLatLng(this._getCenterLayerPoint())},getZoom:function(){return this._zoom},getBounds:function(){var e=this.getPixelBounds();return new A(this.unproject(e.getBottomLeft()),this.unproject(e.getTopRight()))},getMinZoom:function(){return this.options.minZoom===void 0?this._layersMinZoom||0:this.options.minZoom},getMaxZoom:function(){return this.options.maxZoom===void 0?this._layersMaxZoom===void 0?1/0:this._layersMaxZoom:this.options.maxZoom},getBoundsZoom:function(e,t,n){e=j(e),n=D(n||[0,0]);var r=this.getZoom()||0,i=this.getMinZoom(),a=this.getMaxZoom(),o=e.getNorthWest(),s=e.getSouthEast(),c=this.getSize().subtract(n),l=k(this.project(s,r),this.project(o,r)).getSize(),u=R.any3d?this.options.zoomSnap:1,d=c.x/l.x,f=c.y/l.y,p=t?Math.max(d,f):Math.min(d,f);return r=this.getScaleZoom(p,r),u&&(r=Math.round(r/(u/100))*(u/100),r=t?Math.ceil(r/u)*u:Math.floor(r/u)*u),Math.max(i,Math.min(a,r))},getSize:function(){return(!this._size||this._sizeChanged)&&(this._size=new E(this._container.clientWidth||0,this._container.clientHeight||0),this._sizeChanged=!1),this._size.clone()},getPixelBounds:function(e,t){var n=this._getTopLeftPoint(e,t);return new O(n,n.add(this.getSize()))},getPixelOrigin:function(){return this._checkIfLoaded(),this._pixelOrigin},getPixelWorldBounds:function(e){return this.options.crs.getProjectedBounds(e===void 0?this.getZoom():e)},getPane:function(e){return typeof e==`string`?this._panes[e]:e},getPanes:function(){return this._panes},getContainer:function(){return this._container},getZoomScale:function(e,t){var n=this.options.crs;return t=t===void 0?this._zoom:t,n.scale(e)/n.scale(t)},getScaleZoom:function(e,t){var n=this.options.crs;t=t===void 0?this._zoom:t;var r=n.zoom(e*n.scale(t));return isNaN(r)?1/0:r},project:function(e,t){return t=t===void 0?this._zoom:t,this.options.crs.latLngToPoint(N(e),t)},unproject:function(e,t){return t=t===void 0?this._zoom:t,this.options.crs.pointToLatLng(D(e),t)},layerPointToLatLng:function(e){var t=D(e).add(this.getPixelOrigin());return this.unproject(t)},latLngToLayerPoint:function(e){return this.project(N(e))._round()._subtract(this.getPixelOrigin())},wrapLatLng:function(e){return this.options.crs.wrapLatLng(N(e))},wrapLatLngBounds:function(e){return this.options.crs.wrapLatLngBounds(j(e))},distance:function(e,t){return this.options.crs.distance(N(e),N(t))},containerPointToLayerPoint:function(e){return D(e).subtract(this._getMapPanePos())},layerPointToContainerPoint:function(e){return D(e).add(this._getMapPanePos())},containerPointToLatLng:function(e){var t=this.containerPointToLayerPoint(D(e));return this.layerPointToLatLng(t)},latLngToContainerPoint:function(e){return this.layerPointToContainerPoint(this.latLngToLayerPoint(N(e)))},mouseEventToContainerPoint:function(e){return an(e,this._container)},mouseEventToLayerPoint:function(e){return this.containerPointToLayerPoint(this.mouseEventToContainerPoint(e))},mouseEventToLatLng:function(e){return this.layerPointToLatLng(this.mouseEventToLayerPoint(e))},_initContainer:function(e){var t=this._container=xt(e);if(!t)throw Error(`Map container not found.`);if(t._leaflet_id)throw Error(`Map container is already initialized.`);W(t,`scroll`,this._onScroll,this),this._containerId=o(t)},_initLayout:function(){var e=this._container;this._fadeAnimated=this.options.fadeAnimation&&R.any3d,V(e,`leaflet-container`+(R.touch?` leaflet-touch`:``)+(R.retina?` leaflet-retina`:``)+(R.ielt9?` leaflet-oldie`:``)+(R.safari?` leaflet-safari`:``)+(this._fadeAnimated?` leaflet-fade-anim`:``));var t=St(e,`position`);t!==`absolute`&&t!==`relative`&&t!==`fixed`&&t!==`sticky`&&(e.style.position=`relative`),this._initPanes(),this._initControlPos&&this._initControlPos()},_initPanes:function(){var e=this._panes={};this._paneRenderers={},this._mapPane=this.createPane(`mapPane`,this._container),U(this._mapPane,new E(0,0)),this.createPane(`tilePane`),this.createPane(`overlayPane`),this.createPane(`shadowPane`),this.createPane(`markerPane`),this.createPane(`tooltipPane`),this.createPane(`popupPane`),this.options.markerZoomAnimation||(V(e.markerPane,`leaflet-zoom-hide`),V(e.shadowPane,`leaflet-zoom-hide`))},_resetView:function(e,t,n){U(this._mapPane,new E(0,0));var r=!this._loaded;this._loaded=!0,t=this._limitZoom(t),this.fire(`viewprereset`);var i=this._zoom!==t;this._moveStart(i,n)._move(e,t)._moveEnd(i),this.fire(`viewreset`),r&&this.fire(`load`)},_moveStart:function(e,t){return e&&this.fire(`zoomstart`),t||this.fire(`movestart`),this},_move:function(e,t,n,r){t===void 0&&(t=this._zoom);var i=this._zoom!==t;return this._zoom=t,this._lastCenter=e,this._pixelOrigin=this._getNewPixelOrigin(e),r?n&&n.pinch&&this.fire(`zoom`,n):((i||n&&n.pinch)&&this.fire(`zoom`,n),this.fire(`move`,n)),this},_moveEnd:function(e){return e&&this.fire(`zoomend`),this.fire(`moveend`)},_stop:function(){return S(this._flyToFrame),this._panAnim&&this._panAnim.stop(),this},_rawPanBy:function(e){U(this._mapPane,this._getMapPanePos().subtract(e))},_getZoomSpan:function(){return this.getMaxZoom()-this.getMinZoom()},_panInsideMaxBounds:function(){this._enforcingBounds||this.panInsideBounds(this.options.maxBounds)},_checkIfLoaded:function(){if(!this._loaded)throw Error(`Set map center and zoom first.`)},_initEvents:function(e){this._targets={},this._targets[o(this._container)]=this;var t=e?G:W;t(this._container,`click dblclick mousedown mouseup mouseover mouseout mousemove contextmenu keypress keydown keyup`,this._handleDOMEvent,this),this.options.trackResize&&t(window,`resize`,this._onResize,this),R.any3d&&this.options.transform3DLimit&&(e?this.off:this.on).call(this,`moveend`,this._onMoveEnd)},_onResize:function(){S(this._resizeRequest),this._resizeRequest=x(function(){this.invalidateSize({debounceMoveend:!0})},this)},_onScroll:function(){this._container.scrollTop=0,this._container.scrollLeft=0},_onMoveEnd:function(){var e=this._getMapPanePos();Math.max(Math.abs(e.x),Math.abs(e.y))>=this.options.transform3DLimit&&this._resetView(this.getCenter(),this.getZoom())},_findEventTargets:function(e,t){for(var n=[],r,i=t===`mouseout`||t===`mouseover`,a=e.target||e.srcElement,s=!1;a;){if(r=this._targets[o(a)],r&&(t===`click`||t===`preclick`)&&this._draggableMoved(r)){s=!0;break}if(r&&r.listens(t,!0)&&(i&&!cn(a,e)||(n.push(r),i))||a===this._container)break;a=a.parentNode}return!n.length&&!s&&!i&&this.listens(t,!0)&&(n=[this]),n},_isClickDisabled:function(e){for(;e&&e!==this._container;){if(e._leaflet_disable_click)return!0;e=e.parentNode}},_handleDOMEvent:function(e){var t=e.target||e.srcElement;if(!(!this._loaded||t._leaflet_disable_events||e.type===`click`&&this._isClickDisabled(t))){var n=e.type;n===`mousedown`&&Ht(t),this._fireDOMEvent(e,n)}},_mouseEvents:[`click`,`dblclick`,`mouseover`,`mouseout`,`contextmenu`],_fireDOMEvent:function(e,t,r){if(e.type===`click`){var i=n({},e);i.type=`preclick`,this._fireDOMEvent(i,i.type,r)}var a=this._findEventTargets(e,t);if(r){for(var o=[],s=0;s<r.length;s++)r[s].listens(t,!0)&&o.push(r[s]);a=o.concat(a)}if(a.length){t===`contextmenu`&&tn(e);var c=a[0],l={originalEvent:e};if(e.type!==`keypress`&&e.type!==`keydown`&&e.type!==`keyup`){var u=c.getLatLng&&(!c._radius||c._radius<=10);l.containerPoint=u?this.latLngToContainerPoint(c.getLatLng()):this.mouseEventToContainerPoint(e),l.layerPoint=this.containerPointToLayerPoint(l.containerPoint),l.latlng=u?c.getLatLng():this.layerPointToLatLng(l.layerPoint)}for(s=0;s<a.length;s++)if(a[s].fire(t,l,!0),l.originalEvent._stopped||a[s].options.bubblingMouseEvents===!1&&ee(this._mouseEvents,t)!==-1)return}},_draggableMoved:function(e){return e=e.dragging&&e.dragging.enabled()?e:this,e.dragging&&e.dragging.moved()||this.boxZoom&&this.boxZoom.moved()},_clearHandlers:function(){for(var e=0,t=this._handlers.length;e<t;e++)this._handlers[e].disable()},whenReady:function(e,t){return this._loaded?e.call(t||this,{target:this}):this.on(`load`,e,t),this},_getMapPanePos:function(){return Nt(this._mapPane)||new E(0,0)},_moved:function(){var e=this._getMapPanePos();return e&&!e.equals([0,0])},_getTopLeftPoint:function(e,t){return(e&&t!==void 0?this._getNewPixelOrigin(e,t):this.getPixelOrigin()).subtract(this._getMapPanePos())},_getNewPixelOrigin:function(e,t){var n=this.getSize()._divideBy(2);return this.project(e,t)._subtract(n)._add(this._getMapPanePos())._round()},_latLngToNewLayerPoint:function(e,t,n){var r=this._getNewPixelOrigin(n,t);return this.project(e,t)._subtract(r)},_latLngBoundsToNewLayerBounds:function(e,t,n){var r=this._getNewPixelOrigin(n,t);return k([this.project(e.getSouthWest(),t)._subtract(r),this.project(e.getNorthWest(),t)._subtract(r),this.project(e.getSouthEast(),t)._subtract(r),this.project(e.getNorthEast(),t)._subtract(r)])},_getCenterLayerPoint:function(){return this.containerPointToLayerPoint(this.getSize()._divideBy(2))},_getCenterOffset:function(e){return this.latLngToLayerPoint(e).subtract(this._getCenterLayerPoint())},_limitCenter:function(e,t,n){if(!n)return e;var r=this.project(e,t),i=this.getSize().divideBy(2),a=new O(r.subtract(i),r.add(i)),o=this._getBoundsOffset(a,n,t);return Math.abs(o.x)<=1&&Math.abs(o.y)<=1?e:this.unproject(r.add(o),t)},_limitOffset:function(e,t){if(!t)return e;var n=this.getPixelBounds(),r=new O(n.min.add(e),n.max.add(e));return e.add(this._getBoundsOffset(r,t))},_getBoundsOffset:function(e,t,n){var r=k(this.project(t.getNorthEast(),n),this.project(t.getSouthWest(),n)),i=r.min.subtract(e.min),a=r.max.subtract(e.max);return new E(this._rebound(i.x,-a.x),this._rebound(i.y,-a.y))},_rebound:function(e,t){return e+t>0?Math.round(e-t)/2:Math.max(0,Math.ceil(e))-Math.max(0,Math.floor(t))},_limitZoom:function(e){var t=this.getMinZoom(),n=this.getMaxZoom(),r=R.any3d?this.options.zoomSnap:1;return r&&(e=Math.round(e/r)*r),Math.max(t,Math.min(n,e))},_onPanTransitionStep:function(){this.fire(`move`)},_onPanTransitionEnd:function(){H(this._mapPane,`leaflet-pan-anim`),this.fire(`moveend`)},_tryAnimatedPan:function(e,t){var n=this._getCenterOffset(e)._trunc();return(t&&t.animate)!==!0&&!this.getSize().contains(n)?!1:(this.panBy(n,t),!0)},_createAnimProxy:function(){var e=this._proxy=z(`div`,`leaflet-proxy leaflet-zoom-animated`);this._panes.mapPane.appendChild(e),this.on(`zoomanim`,function(e){var t=vt,n=this._proxy.style[t];Mt(this._proxy,this.project(e.center,e.zoom),this.getZoomScale(e.zoom,1)),n===this._proxy.style[t]&&this._animatingZoom&&this._onZoomTransitionEnd()},this),this.on(`load moveend`,this._animMoveEnd,this),this._on(`unload`,this._destroyAnimProxy,this)},_destroyAnimProxy:function(){B(this._proxy),this.off(`load moveend`,this._animMoveEnd,this),delete this._proxy},_animMoveEnd:function(){var e=this.getCenter(),t=this.getZoom();Mt(this._proxy,this.project(e,t),this.getZoomScale(t,1))},_catchTransitionEnd:function(e){this._animatingZoom&&e.propertyName.indexOf(`transform`)>=0&&this._onZoomTransitionEnd()},_nothingToAnimate:function(){return!this._container.getElementsByClassName(`leaflet-zoom-animated`).length},_tryAnimatedZoom:function(e,t,n){if(this._animatingZoom)return!0;if(n||={},!this._zoomAnimated||n.animate===!1||this._nothingToAnimate()||Math.abs(t-this._zoom)>this.options.zoomAnimationThreshold)return!1;var r=this.getZoomScale(t),i=this._getCenterOffset(e)._divideBy(1-1/r);return n.animate!==!0&&!this.getSize().contains(i)?!1:(x(function(){this._moveStart(!0,n.noMoveStart||!1)._animateZoom(e,t,!0)},this),!0)},_animateZoom:function(e,t,n,r){this._mapPane&&(n&&(this._animatingZoom=!0,this._animateToCenter=e,this._animateToZoom=t,V(this._mapPane,`leaflet-zoom-anim`)),this.fire(`zoomanim`,{center:e,zoom:t,noUpdate:r}),this._tempFireZoomEvent||=this._zoom!==this._animateToZoom,this._move(this._animateToCenter,this._animateToZoom,void 0,!0),setTimeout(i(this._onZoomTransitionEnd,this),250))},_onZoomTransitionEnd:function(){this._animatingZoom&&(this._mapPane&&H(this._mapPane,`leaflet-zoom-anim`),this._animatingZoom=!1,this._move(this._animateToCenter,this._animateToZoom,void 0,!0),this._tempFireZoomEvent&&this.fire(`zoom`),delete this._tempFireZoomEvent,this.fire(`move`),this._moveEnd(!0))}});function dn(e,t){return new K(e,t)}var fn=C.extend({options:{position:`topright`},initialize:function(e){p(this,e)},getPosition:function(){return this.options.position},setPosition:function(e){var t=this._map;return t&&t.removeControl(this),this.options.position=e,t&&t.addControl(this),this},getContainer:function(){return this._container},addTo:function(e){this.remove(),this._map=e;var t=this._container=this.onAdd(e),n=this.getPosition(),r=e._controlCorners[n];return V(t,`leaflet-control`),n.indexOf(`bottom`)===-1?r.appendChild(t):r.insertBefore(t,r.firstChild),this._map.on(`unload`,this.remove,this),this},remove:function(){return this._map?(B(this._container),this.onRemove&&this.onRemove(this._map),this._map.off(`unload`,this.remove,this),this._map=null,this):this},_refocusOnMap:function(e){this._map&&e&&e.screenX>0&&e.screenY>0&&this._map.getContainer().focus()}}),pn=function(e){return new fn(e)};K.include({addControl:function(e){return e.addTo(this),this},removeControl:function(e){return e.remove(),this},_initControlPos:function(){var e=this._controlCorners={},t=`leaflet-`,n=this._controlContainer=z(`div`,t+`control-container`,this._container);function r(r,i){var a=t+r+` `+t+i;e[r+i]=z(`div`,a,n)}r(`top`,`left`),r(`top`,`right`),r(`bottom`,`left`),r(`bottom`,`right`)},_clearControlPos:function(){for(var e in this._controlCorners)B(this._controlCorners[e]);B(this._controlContainer),delete this._controlCorners,delete this._controlContainer}});var mn=fn.extend({options:{collapsed:!0,position:`topright`,autoZIndex:!0,hideSingleBase:!1,sortLayers:!1,sortFunction:function(e,t,n,r){return n<r?-1:+(r<n)}},initialize:function(e,t,n){for(var r in p(this,n),this._layerControlInputs=[],this._layers=[],this._lastZIndex=0,this._handlingClick=!1,this._preventClick=!1,e)this._addLayer(e[r],r);for(r in t)this._addLayer(t[r],r,!0)},onAdd:function(e){this._initLayout(),this._update(),this._map=e,e.on(`zoomend`,this._checkDisabledLayers,this);for(var t=0;t<this._layers.length;t++)this._layers[t].layer.on(`add remove`,this._onLayerChange,this);return this._container},addTo:function(e){return fn.prototype.addTo.call(this,e),this._expandIfNotCollapsed()},onRemove:function(){this._map.off(`zoomend`,this._checkDisabledLayers,this);for(var e=0;e<this._layers.length;e++)this._layers[e].layer.off(`add remove`,this._onLayerChange,this)},addBaseLayer:function(e,t){return this._addLayer(e,t),this._map?this._update():this},addOverlay:function(e,t){return this._addLayer(e,t,!0),this._map?this._update():this},removeLayer:function(e){e.off(`add remove`,this._onLayerChange,this);var t=this._getLayer(o(e));return t&&this._layers.splice(this._layers.indexOf(t),1),this._map?this._update():this},expand:function(){V(this._container,`leaflet-control-layers-expanded`),this._section.style.height=null;var e=this._map.getSize().y-(this._container.offsetTop+50);return e<this._section.clientHeight?(V(this._section,`leaflet-control-layers-scrollbar`),this._section.style.height=e+`px`):H(this._section,`leaflet-control-layers-scrollbar`),this._checkDisabledLayers(),this},collapse:function(){return H(this._container,`leaflet-control-layers-expanded`),this},_initLayout:function(){var e=`leaflet-control-layers`,t=this._container=z(`div`,e),n=this.options.collapsed;t.setAttribute(`aria-haspopup`,!0),en(t),$t(t);var r=this._section=z(`section`,e+`-list`);n&&(this._map.on(`click`,this.collapse,this),W(t,{mouseenter:this._expandSafely,mouseleave:this.collapse},this));var i=this._layersLink=z(`a`,e+`-toggle`,t);i.href=`#`,i.title=`Layers`,i.setAttribute(`role`,`button`),W(i,{keydown:function(e){e.keyCode===13&&this._expandSafely()},click:function(e){tn(e),this._expandSafely()}},this),n||this.expand(),this._baseLayersList=z(`div`,e+`-base`,r),this._separator=z(`div`,e+`-separator`,r),this._overlaysList=z(`div`,e+`-overlays`,r),t.appendChild(r)},_getLayer:function(e){for(var t=0;t<this._layers.length;t++)if(this._layers[t]&&o(this._layers[t].layer)===e)return this._layers[t]},_addLayer:function(e,t,n){this._map&&e.on(`add remove`,this._onLayerChange,this),this._layers.push({layer:e,name:t,overlay:n}),this.options.sortLayers&&this._layers.sort(i(function(e,t){return this.options.sortFunction(e.layer,t.layer,e.name,t.name)},this)),this.options.autoZIndex&&e.setZIndex&&(this._lastZIndex++,e.setZIndex(this._lastZIndex)),this._expandIfNotCollapsed()},_update:function(){if(!this._container)return this;Ct(this._baseLayersList),Ct(this._overlaysList),this._layerControlInputs=[];var e,t,n,r,i=0;for(n=0;n<this._layers.length;n++)r=this._layers[n],this._addItem(r),t||=r.overlay,e||=!r.overlay,i+=+!r.overlay;return this.options.hideSingleBase&&(e&&=i>1,this._baseLayersList.style.display=e?``:`none`),this._separator.style.display=t&&e?``:`none`,this},_onLayerChange:function(e){this._handlingClick||this._update();var t=this._getLayer(o(e.target)),n=t.overlay?e.type===`add`?`overlayadd`:`overlayremove`:e.type===`add`?`baselayerchange`:null;n&&this._map.fire(n,t)},_createRadioElement:function(e,t){var n=`<input type="radio" class="leaflet-control-layers-selector" name="`+e+`"`+(t?` checked="checked"`:``)+`/>`,r=document.createElement(`div`);return r.innerHTML=n,r.firstChild},_addItem:function(e){var t=document.createElement(`label`),n=this._map.hasLayer(e.layer),r;e.overlay?(r=document.createElement(`input`),r.type=`checkbox`,r.className=`leaflet-control-layers-selector`,r.defaultChecked=n):r=this._createRadioElement(`leaflet-base-layers_`+o(this),n),this._layerControlInputs.push(r),r.layerId=o(e.layer),W(r,`click`,this._onInputClick,this);var i=document.createElement(`span`);i.innerHTML=` `+e.name;var a=document.createElement(`span`);return t.appendChild(a),a.appendChild(r),a.appendChild(i),(e.overlay?this._overlaysList:this._baseLayersList).appendChild(t),this._checkDisabledLayers(),t},_onInputClick:function(){if(!this._preventClick){var e=this._layerControlInputs,t,n,r=[],i=[];this._handlingClick=!0;for(var a=e.length-1;a>=0;a--)t=e[a],n=this._getLayer(t.layerId).layer,t.checked?r.push(n):t.checked||i.push(n);for(a=0;a<i.length;a++)this._map.hasLayer(i[a])&&this._map.removeLayer(i[a]);for(a=0;a<r.length;a++)this._map.hasLayer(r[a])||this._map.addLayer(r[a]);this._handlingClick=!1,this._refocusOnMap()}},_checkDisabledLayers:function(){for(var e=this._layerControlInputs,t,n,r=this._map.getZoom(),i=e.length-1;i>=0;i--)t=e[i],n=this._getLayer(t.layerId).layer,t.disabled=n.options.minZoom!==void 0&&r<n.options.minZoom||n.options.maxZoom!==void 0&&r>n.options.maxZoom},_expandIfNotCollapsed:function(){return this._map&&!this.options.collapsed&&this.expand(),this},_expandSafely:function(){var e=this._section;this._preventClick=!0,W(e,`click`,tn),this.expand();var t=this;setTimeout(function(){G(e,`click`,tn),t._preventClick=!1})}}),hn=function(e,t,n){return new mn(e,t,n)},gn=fn.extend({options:{position:`topleft`,zoomInText:`<span aria-hidden="true">+</span>`,zoomInTitle:`Zoom in`,zoomOutText:`<span aria-hidden="true">&#x2212;</span>`,zoomOutTitle:`Zoom out`},onAdd:function(e){var t=`leaflet-control-zoom`,n=z(`div`,t+` leaflet-bar`),r=this.options;return this._zoomInButton=this._createButton(r.zoomInText,r.zoomInTitle,t+`-in`,n,this._zoomIn),this._zoomOutButton=this._createButton(r.zoomOutText,r.zoomOutTitle,t+`-out`,n,this._zoomOut),this._updateDisabled(),e.on(`zoomend zoomlevelschange`,this._updateDisabled,this),n},onRemove:function(e){e.off(`zoomend zoomlevelschange`,this._updateDisabled,this)},disable:function(){return this._disabled=!0,this._updateDisabled(),this},enable:function(){return this._disabled=!1,this._updateDisabled(),this},_zoomIn:function(e){!this._disabled&&this._map._zoom<this._map.getMaxZoom()&&this._map.zoomIn(this._map.options.zoomDelta*(e.shiftKey?3:1))},_zoomOut:function(e){!this._disabled&&this._map._zoom>this._map.getMinZoom()&&this._map.zoomOut(this._map.options.zoomDelta*(e.shiftKey?3:1))},_createButton:function(e,t,n,r,i){var a=z(`a`,n,r);return a.innerHTML=e,a.href=`#`,a.title=t,a.setAttribute(`role`,`button`),a.setAttribute(`aria-label`,t),en(a),W(a,`click`,nn),W(a,`click`,i,this),W(a,`click`,this._refocusOnMap,this),a},_updateDisabled:function(){var e=this._map,t=`leaflet-disabled`;H(this._zoomInButton,t),H(this._zoomOutButton,t),this._zoomInButton.setAttribute(`aria-disabled`,`false`),this._zoomOutButton.setAttribute(`aria-disabled`,`false`),(this._disabled||e._zoom===e.getMinZoom())&&(V(this._zoomOutButton,t),this._zoomOutButton.setAttribute(`aria-disabled`,`true`)),(this._disabled||e._zoom===e.getMaxZoom())&&(V(this._zoomInButton,t),this._zoomInButton.setAttribute(`aria-disabled`,`true`))}});K.mergeOptions({zoomControl:!0}),K.addInitHook(function(){this.options.zoomControl&&(this.zoomControl=new gn,this.addControl(this.zoomControl))});var _n=function(e){return new gn(e)},vn=fn.extend({options:{position:`bottomleft`,maxWidth:100,metric:!0,imperial:!0},onAdd:function(e){var t=`leaflet-control-scale`,n=z(`div`,t),r=this.options;return this._addScales(r,t+`-line`,n),e.on(r.updateWhenIdle?`moveend`:`move`,this._update,this),e.whenReady(this._update,this),n},onRemove:function(e){e.off(this.options.updateWhenIdle?`moveend`:`move`,this._update,this)},_addScales:function(e,t,n){e.metric&&(this._mScale=z(`div`,t,n)),e.imperial&&(this._iScale=z(`div`,t,n))},_update:function(){var e=this._map,t=e.getSize().y/2,n=e.distance(e.containerPointToLatLng([0,t]),e.containerPointToLatLng([this.options.maxWidth,t]));this._updateScales(n)},_updateScales:function(e){this.options.metric&&e&&this._updateMetric(e),this.options.imperial&&e&&this._updateImperial(e)},_updateMetric:function(e){var t=this._getRoundNum(e),n=t<1e3?t+` m`:t/1e3+` km`;this._updateScale(this._mScale,n,t/e)},_updateImperial:function(e){var t=e*3.2808399,n,r,i;t>5280?(n=t/5280,r=this._getRoundNum(n),this._updateScale(this._iScale,r+` mi`,r/n)):(i=this._getRoundNum(t),this._updateScale(this._iScale,i+` ft`,i/t))},_updateScale:function(e,t,n){e.style.width=Math.round(this.options.maxWidth*n)+`px`,e.innerHTML=t},_getRoundNum:function(e){var t=10**((Math.floor(e)+``).length-1),n=e/t;return n=n>=10?10:n>=5?5:n>=3?3:n>=2?2:1,t*n}}),yn=function(e){return new vn(e)},bn=fn.extend({options:{position:`bottomright`,prefix:`<a href="https://leafletjs.com" title="A JavaScript library for interactive maps">`+(R.inlineSvg?`<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="12" height="8" viewBox="0 0 12 8" class="leaflet-attribution-flag"><path fill="#4C7BE1" d="M0 0h12v4H0z"/><path fill="#FFD500" d="M0 4h12v3H0z"/><path fill="#E0BC00" d="M0 7h12v1H0z"/></svg> `:``)+`Leaflet</a>`},initialize:function(e){p(this,e),this._attributions={}},onAdd:function(e){for(var t in e.attributionControl=this,this._container=z(`div`,`leaflet-control-attribution`),en(this._container),e._layers)e._layers[t].getAttribution&&this.addAttribution(e._layers[t].getAttribution());return this._update(),e.on(`layeradd`,this._addAttribution,this),this._container},onRemove:function(e){e.off(`layeradd`,this._addAttribution,this)},_addAttribution:function(e){e.layer.getAttribution&&(this.addAttribution(e.layer.getAttribution()),e.layer.once(`remove`,function(){this.removeAttribution(e.layer.getAttribution())},this))},setPrefix:function(e){return this.options.prefix=e,this._update(),this},addAttribution:function(e){return e?(this._attributions[e]||(this._attributions[e]=0),this._attributions[e]++,this._update(),this):this},removeAttribution:function(e){return e&&this._attributions[e]&&(this._attributions[e]--,this._update()),this},_update:function(){if(this._map){var e=[];for(var t in this._attributions)this._attributions[t]&&e.push(t);var n=[];this.options.prefix&&n.push(this.options.prefix),e.length&&n.push(e.join(`, `)),this._container.innerHTML=n.join(` <span aria-hidden="true">|</span> `)}}});K.mergeOptions({attributionControl:!0}),K.addInitHook(function(){this.options.attributionControl&&new bn().addTo(this)}),fn.Layers=mn,fn.Zoom=gn,fn.Scale=vn,fn.Attribution=bn,pn.layers=hn,pn.zoom=_n,pn.scale=yn,pn.attribution=function(e){return new bn(e)};var xn=C.extend({initialize:function(e){this._map=e},enable:function(){return this._enabled?this:(this._enabled=!0,this.addHooks(),this)},disable:function(){return this._enabled?(this._enabled=!1,this.removeHooks(),this):this},enabled:function(){return!!this._enabled}});xn.addTo=function(e,t){return e.addHandler(t,this),this};var Sn={Events:w},Cn=R.touch?`touchstart mousedown`:`mousedown`,wn=T.extend({options:{clickTolerance:3},initialize:function(e,t,n,r){p(this,r),this._element=e,this._dragStartTarget=t||e,this._preventOutline=n},enable:function(){this._enabled||=(W(this._dragStartTarget,Cn,this._onDown,this),!0)},disable:function(){this._enabled&&(wn._dragging===this&&this.finishDrag(!0),G(this._dragStartTarget,Cn,this._onDown,this),this._enabled=!1,this._moved=!1)},_onDown:function(e){if(this._enabled&&(this._moved=!1,!Et(this._element,`leaflet-zoom-anim`))){if(e.touches&&e.touches.length!==1){wn._dragging===this&&this.finishDrag();return}if(!(wn._dragging||e.shiftKey||e.which!==1&&e.button!==1&&!e.touches)&&(wn._dragging=this,this._preventOutline&&Ht(this._element),Rt(),Pt(),!this._moving)){this.fire(`down`);var t=e.touches?e.touches[0]:e,n=Wt(this._element);this._startPoint=new E(t.clientX,t.clientY),this._startPos=Nt(this._element),this._parentScale=Gt(n);var r=e.type===`mousedown`;W(document,r?`mousemove`:`touchmove`,this._onMove,this),W(document,r?`mouseup`:`touchend touchcancel`,this._onUp,this)}}},_onMove:function(e){if(this._enabled){if(e.touches&&e.touches.length>1){this._moved=!0;return}var t=e.touches&&e.touches.length===1?e.touches[0]:e,n=new E(t.clientX,t.clientY)._subtract(this._startPoint);!n.x&&!n.y||Math.abs(n.x)+Math.abs(n.y)<this.options.clickTolerance||(n.x/=this._parentScale.x,n.y/=this._parentScale.y,tn(e),this._moved||(this.fire(`dragstart`),this._moved=!0,V(document.body,`leaflet-dragging`),this._lastTarget=e.target||e.srcElement,window.SVGElementInstance&&this._lastTarget instanceof window.SVGElementInstance&&(this._lastTarget=this._lastTarget.correspondingUseElement),V(this._lastTarget,`leaflet-drag-target`)),this._newPos=this._startPos.add(n),this._moving=!0,this._lastEvent=e,this._updatePosition())}},_updatePosition:function(){var e={originalEvent:this._lastEvent};this.fire(`predrag`,e),U(this._element,this._newPos),this.fire(`drag`,e)},_onUp:function(){this._enabled&&this.finishDrag()},finishDrag:function(e){H(document.body,`leaflet-dragging`),this._lastTarget&&=(H(this._lastTarget,`leaflet-drag-target`),null),G(document,`mousemove touchmove`,this._onMove,this),G(document,`mouseup touchend touchcancel`,this._onUp,this),zt(),Ft();var t=this._moved&&this._moving;this._moving=!1,wn._dragging=!1,t&&this.fire(`dragend`,{noInertia:e,distance:this._newPos.distanceTo(this._startPos)})}});function Tn(e,t,n){var r,i=[1,4,2,8],a,o,s,c,l,u,d,f;for(a=0,u=e.length;a<u;a++)e[a]._code=Rn(e[a],t);for(s=0;s<4;s++){for(d=i[s],r=[],a=0,u=e.length,o=u-1;a<u;o=a++)c=e[a],l=e[o],c._code&d?l._code&d||(f=Ln(l,c,d,t,n),f._code=Rn(f,t),r.push(f)):(l._code&d&&(f=Ln(l,c,d,t,n),f._code=Rn(f,t),r.push(f)),r.push(c));e=r}return e}function En(e,t){var n,r,i,a,o,s,c,l,u;if(!e||e.length===0)throw Error(`latlngs not passed`);Vn(e)||(console.warn(`latlngs are not flat! Only the first ring will be used`),e=e[0]);var d=N([0,0]),f=j(e);f.getNorthWest().distanceTo(f.getSouthWest())*f.getNorthEast().distanceTo(f.getNorthWest())<1700&&(d=Dn(e));var p=e.length,m=[];for(n=0;n<p;n++){var h=N(e[n]);m.push(t.project(N([h.lat-d.lat,h.lng-d.lng])))}for(s=c=l=0,n=0,r=p-1;n<p;r=n++)i=m[n],a=m[r],o=i.y*a.x-a.y*i.x,c+=(i.x+a.x)*o,l+=(i.y+a.y)*o,s+=o*3;u=s===0?m[0]:[c/s,l/s];var g=t.unproject(D(u));return N([g.lat+d.lat,g.lng+d.lng])}function Dn(e){for(var t=0,n=0,r=0,i=0;i<e.length;i++){var a=N(e[i]);t+=a.lat,n+=a.lng,r++}return N([t/r,n/r])}var On={__proto__:null,clipPolygon:Tn,polygonCenter:En,centroid:Dn};function kn(e,t){if(!t||!e.length)return e.slice();var n=t*t;return e=Pn(e,n),e=Mn(e,n),e}function An(e,t,n){return Math.sqrt(Bn(e,t,n,!0))}function jn(e,t,n){return Bn(e,t,n)}function Mn(e,t){var n=e.length,r=new(typeof Uint8Array<`u`?Uint8Array:Array)(n);r[0]=r[n-1]=1,Nn(e,r,t,0,n-1);var i,a=[];for(i=0;i<n;i++)r[i]&&a.push(e[i]);return a}function Nn(e,t,n,r,i){var a=0,o,s,c;for(s=r+1;s<=i-1;s++)c=Bn(e[s],e[r],e[i],!0),c>a&&(o=s,a=c);a>n&&(t[o]=1,Nn(e,t,n,r,o),Nn(e,t,n,o,i))}function Pn(e,t){for(var n=[e[0]],r=1,i=0,a=e.length;r<a;r++)zn(e[r],e[i])>t&&(n.push(e[r]),i=r);return i<a-1&&n.push(e[a-1]),n}var Fn;function In(e,t,n,r,i){var a=r?Fn:Rn(e,n),o=Rn(t,n),s,c,l;for(Fn=o;;){if(!(a|o))return[e,t];if(a&o)return!1;s=a||o,c=Ln(e,t,s,n,i),l=Rn(c,n),s===a?(e=c,a=l):(t=c,o=l)}}function Ln(e,t,n,r,i){var a=t.x-e.x,o=t.y-e.y,s=r.min,c=r.max,l,u;return n&8?(l=e.x+a*(c.y-e.y)/o,u=c.y):n&4?(l=e.x+a*(s.y-e.y)/o,u=s.y):n&2?(l=c.x,u=e.y+o*(c.x-e.x)/a):n&1&&(l=s.x,u=e.y+o*(s.x-e.x)/a),new E(l,u,i)}function Rn(e,t){var n=0;return e.x<t.min.x?n|=1:e.x>t.max.x&&(n|=2),e.y<t.min.y?n|=4:e.y>t.max.y&&(n|=8),n}function zn(e,t){var n=t.x-e.x,r=t.y-e.y;return n*n+r*r}function Bn(e,t,n,r){var i=t.x,a=t.y,o=n.x-i,s=n.y-a,c=o*o+s*s,l;return c>0&&(l=((e.x-i)*o+(e.y-a)*s)/c,l>1?(i=n.x,a=n.y):l>0&&(i+=o*l,a+=s*l)),o=e.x-i,s=e.y-a,r?o*o+s*s:new E(i,a)}function Vn(e){return!_(e[0])||typeof e[0][0]!=`object`&&e[0][0]!==void 0}function Hn(e){return console.warn(`Deprecated use of _flat, please use L.LineUtil.isFlat instead.`),Vn(e)}function Un(e,t){var n,r,i,a,o,s,c,l;if(!e||e.length===0)throw Error(`latlngs not passed`);Vn(e)||(console.warn(`latlngs are not flat! Only the first ring will be used`),e=e[0]);var u=N([0,0]),d=j(e);d.getNorthWest().distanceTo(d.getSouthWest())*d.getNorthEast().distanceTo(d.getNorthWest())<1700&&(u=Dn(e));var f=e.length,p=[];for(n=0;n<f;n++){var m=N(e[n]);p.push(t.project(N([m.lat-u.lat,m.lng-u.lng])))}for(n=0,r=0;n<f-1;n++)r+=p[n].distanceTo(p[n+1])/2;if(r===0)l=p[0];else for(n=0,a=0;n<f-1;n++)if(o=p[n],s=p[n+1],i=o.distanceTo(s),a+=i,a>r){c=(a-r)/i,l=[s.x-c*(s.x-o.x),s.y-c*(s.y-o.y)];break}var h=t.unproject(D(l));return N([h.lat+u.lat,h.lng+u.lng])}var Wn={__proto__:null,simplify:kn,pointToSegmentDistance:An,closestPointOnSegment:jn,clipSegment:In,_getEdgeIntersection:Ln,_getBitCode:Rn,_sqClosestPointOnSegment:Bn,isFlat:Vn,_flat:Hn,polylineCenter:Un},Gn={project:function(e){return new E(e.lng,e.lat)},unproject:function(e){return new M(e.y,e.x)},bounds:new O([-180,-90],[180,90])},Kn={R:6378137,R_MINOR:6356752.314245179,bounds:new O([-20037508.34279,-15496570.73972],[20037508.34279,18764656.23138]),project:function(e){var t=Math.PI/180,n=this.R,r=e.lat*t,i=this.R_MINOR/n,a=Math.sqrt(1-i*i),o=a*Math.sin(r),s=Math.tan(Math.PI/4-r/2)/((1-o)/(1+o))**(a/2);return r=-n*Math.log(Math.max(s,1e-10)),new E(e.lng*t*n,r)},unproject:function(e){for(var t=180/Math.PI,n=this.R,r=this.R_MINOR/n,i=Math.sqrt(1-r*r),a=Math.exp(-e.y/n),o=Math.PI/2-2*Math.atan(a),s=0,c=.1,l;s<15&&Math.abs(c)>1e-7;s++)l=i*Math.sin(o),l=((1-l)/(1+l))**(i/2),c=Math.PI/2-2*Math.atan(a*l)-o,o+=c;return new M(o*t,e.x*t/n)}},qn={__proto__:null,LonLat:Gn,Mercator:Kn,SphericalMercator:le},Jn=n({},P,{code:`EPSG:3395`,projection:Kn,transformation:function(){var e=.5/(Math.PI*Kn.R);return de(e,.5,-e,.5)}()}),Yn=n({},P,{code:`EPSG:4326`,projection:Gn,transformation:de(1/180,1,-1/180,.5)}),Xn=n({},se,{projection:Gn,transformation:de(1,0,-1,0),scale:function(e){return 2**e},zoom:function(e){return Math.log(e)/Math.LN2},distance:function(e,t){var n=t.lng-e.lng,r=t.lat-e.lat;return Math.sqrt(n*n+r*r)},infinite:!0});se.Earth=P,se.EPSG3395=Jn,se.EPSG3857=fe,se.EPSG900913=pe,se.EPSG4326=Yn,se.Simple=Xn;var Zn=T.extend({options:{pane:`overlayPane`,attribution:null,bubblingMouseEvents:!0},addTo:function(e){return e.addLayer(this),this},remove:function(){return this.removeFrom(this._map||this._mapToAdd)},removeFrom:function(e){return e&&e.removeLayer(this),this},getPane:function(e){return this._map.getPane(e?this.options[e]||e:this.options.pane)},addInteractiveTarget:function(e){return this._map._targets[o(e)]=this,this},removeInteractiveTarget:function(e){return delete this._map._targets[o(e)],this},getAttribution:function(){return this.options.attribution},_layerAdd:function(e){var t=e.target;if(t.hasLayer(this)){if(this._map=t,this._zoomAnimated=t._zoomAnimated,this.getEvents){var n=this.getEvents();t.on(n,this),this.once(`remove`,function(){t.off(n,this)},this)}this.onAdd(t),this.fire(`add`),t.fire(`layeradd`,{layer:this})}}});K.include({addLayer:function(e){if(!e._layerAdd)throw Error(`The provided object is not a Layer.`);var t=o(e);return this._layers[t]?this:(this._layers[t]=e,e._mapToAdd=this,e.beforeAdd&&e.beforeAdd(this),this.whenReady(e._layerAdd,e),this)},removeLayer:function(e){var t=o(e);return this._layers[t]?(this._loaded&&e.onRemove(this),delete this._layers[t],this._loaded&&(this.fire(`layerremove`,{layer:e}),e.fire(`remove`)),e._map=e._mapToAdd=null,this):this},hasLayer:function(e){return o(e)in this._layers},eachLayer:function(e,t){for(var n in this._layers)e.call(t,this._layers[n]);return this},_addLayers:function(e){e=e?_(e)?e:[e]:[];for(var t=0,n=e.length;t<n;t++)this.addLayer(e[t])},_addZoomLimit:function(e){(!isNaN(e.options.maxZoom)||!isNaN(e.options.minZoom))&&(this._zoomBoundLayers[o(e)]=e,this._updateZoomLevels())},_removeZoomLimit:function(e){var t=o(e);this._zoomBoundLayers[t]&&(delete this._zoomBoundLayers[t],this._updateZoomLevels())},_updateZoomLevels:function(){var e=1/0,t=-1/0,n=this._getZoomSpan();for(var r in this._zoomBoundLayers){var i=this._zoomBoundLayers[r].options;e=i.minZoom===void 0?e:Math.min(e,i.minZoom),t=i.maxZoom===void 0?t:Math.max(t,i.maxZoom)}this._layersMaxZoom=t===-1/0?void 0:t,this._layersMinZoom=e===1/0?void 0:e,n!==this._getZoomSpan()&&this.fire(`zoomlevelschange`),this.options.maxZoom===void 0&&this._layersMaxZoom&&this.getZoom()>this._layersMaxZoom&&this.setZoom(this._layersMaxZoom),this.options.minZoom===void 0&&this._layersMinZoom&&this.getZoom()<this._layersMinZoom&&this.setZoom(this._layersMinZoom)}});var Qn=Zn.extend({initialize:function(e,t){p(this,t),this._layers={};var n,r;if(e)for(n=0,r=e.length;n<r;n++)this.addLayer(e[n])},addLayer:function(e){var t=this.getLayerId(e);return this._layers[t]=e,this._map&&this._map.addLayer(e),this},removeLayer:function(e){var t=e in this._layers?e:this.getLayerId(e);return this._map&&this._layers[t]&&this._map.removeLayer(this._layers[t]),delete this._layers[t],this},hasLayer:function(e){return(typeof e==`number`?e:this.getLayerId(e))in this._layers},clearLayers:function(){return this.eachLayer(this.removeLayer,this)},invoke:function(e){var t=Array.prototype.slice.call(arguments,1),n,r;for(n in this._layers)r=this._layers[n],r[e]&&r[e].apply(r,t);return this},onAdd:function(e){this.eachLayer(e.addLayer,e)},onRemove:function(e){this.eachLayer(e.removeLayer,e)},eachLayer:function(e,t){for(var n in this._layers)e.call(t,this._layers[n]);return this},getLayer:function(e){return this._layers[e]},getLayers:function(){var e=[];return this.eachLayer(e.push,e),e},setZIndex:function(e){return this.invoke(`setZIndex`,e)},getLayerId:function(e){return o(e)}}),$n=function(e,t){return new Qn(e,t)},er=Qn.extend({addLayer:function(e){return this.hasLayer(e)?this:(e.addEventParent(this),Qn.prototype.addLayer.call(this,e),this.fire(`layeradd`,{layer:e}))},removeLayer:function(e){return this.hasLayer(e)?(e in this._layers&&(e=this._layers[e]),e.removeEventParent(this),Qn.prototype.removeLayer.call(this,e),this.fire(`layerremove`,{layer:e})):this},setStyle:function(e){return this.invoke(`setStyle`,e)},bringToFront:function(){return this.invoke(`bringToFront`)},bringToBack:function(){return this.invoke(`bringToBack`)},getBounds:function(){var e=new A;for(var t in this._layers){var n=this._layers[t];e.extend(n.getBounds?n.getBounds():n.getLatLng())}return e}}),tr=function(e,t){return new er(e,t)},nr=C.extend({options:{popupAnchor:[0,0],tooltipAnchor:[0,0],crossOrigin:!1},initialize:function(e){p(this,e)},createIcon:function(e){return this._createIcon(`icon`,e)},createShadow:function(e){return this._createIcon(`shadow`,e)},_createIcon:function(e,t){var n=this._getIconUrl(e);if(!n){if(e===`icon`)throw Error(`iconUrl not set in Icon options (see the docs).`);return null}var r=this._createImg(n,t&&t.tagName===`IMG`?t:null);return this._setIconStyles(r,e),(this.options.crossOrigin||this.options.crossOrigin===``)&&(r.crossOrigin=this.options.crossOrigin===!0?``:this.options.crossOrigin),r},_setIconStyles:function(e,t){var n=this.options,r=n[t+`Size`];typeof r==`number`&&(r=[r,r]);var i=D(r),a=D(t===`shadow`&&n.shadowAnchor||n.iconAnchor||i&&i.divideBy(2,!0));e.className=`leaflet-marker-`+t+` `+(n.className||``),a&&(e.style.marginLeft=-a.x+`px`,e.style.marginTop=-a.y+`px`),i&&(e.style.width=i.x+`px`,e.style.height=i.y+`px`)},_createImg:function(e,t){return t||=document.createElement(`img`),t.src=e,t},_getIconUrl:function(e){return R.retina&&this.options[e+`RetinaUrl`]||this.options[e+`Url`]}});function rr(e){return new nr(e)}var ir=nr.extend({options:{iconUrl:`marker-icon.png`,iconRetinaUrl:`marker-icon-2x.png`,shadowUrl:`marker-shadow.png`,iconSize:[25,41],iconAnchor:[12,41],popupAnchor:[1,-34],tooltipAnchor:[16,-28],shadowSize:[41,41]},_getIconUrl:function(e){return typeof ir.imagePath!=`string`&&(ir.imagePath=this._detectIconPath()),(this.options.imagePath||ir.imagePath)+nr.prototype._getIconUrl.call(this,e)},_stripUrl:function(e){var t=function(e,t,n){var r=t.exec(e);return r&&r[n]};return e=t(e,/^url\((['"])?(.+)\1\)$/,2),e&&t(e,/^(.*)marker-icon\.png$/,1)},_detectIconPath:function(){var e=z(`div`,`leaflet-default-icon-path`,document.body),t=St(e,`background-image`)||St(e,`backgroundImage`);if(document.body.removeChild(e),t=this._stripUrl(t),t)return t;var n=document.querySelector(`link[href$="leaflet.css"]`);return n?n.href.substring(0,n.href.length-11-1):``}}),ar=xn.extend({initialize:function(e){this._marker=e},addHooks:function(){var e=this._marker._icon;this._draggable||=new wn(e,e,!0),this._draggable.on({dragstart:this._onDragStart,predrag:this._onPreDrag,drag:this._onDrag,dragend:this._onDragEnd},this).enable(),V(e,`leaflet-marker-draggable`)},removeHooks:function(){this._draggable.off({dragstart:this._onDragStart,predrag:this._onPreDrag,drag:this._onDrag,dragend:this._onDragEnd},this).disable(),this._marker._icon&&H(this._marker._icon,`leaflet-marker-draggable`)},moved:function(){return this._draggable&&this._draggable._moved},_adjustPan:function(e){var t=this._marker,n=t._map,r=this._marker.options.autoPanSpeed,i=this._marker.options.autoPanPadding,a=Nt(t._icon),o=n.getPixelBounds(),s=n.getPixelOrigin(),c=k(o.min._subtract(s).add(i),o.max._subtract(s).subtract(i));if(!c.contains(a)){var l=D((Math.max(c.max.x,a.x)-c.max.x)/(o.max.x-c.max.x)-(Math.min(c.min.x,a.x)-c.min.x)/(o.min.x-c.min.x),(Math.max(c.max.y,a.y)-c.max.y)/(o.max.y-c.max.y)-(Math.min(c.min.y,a.y)-c.min.y)/(o.min.y-c.min.y)).multiplyBy(r);n.panBy(l,{animate:!1}),this._draggable._newPos._add(l),this._draggable._startPos._add(l),U(t._icon,this._draggable._newPos),this._onDrag(e),this._panRequest=x(this._adjustPan.bind(this,e))}},_onDragStart:function(){this._oldLatLng=this._marker.getLatLng(),this._marker.closePopup&&this._marker.closePopup(),this._marker.fire(`movestart`).fire(`dragstart`)},_onPreDrag:function(e){this._marker.options.autoPan&&(S(this._panRequest),this._panRequest=x(this._adjustPan.bind(this,e)))},_onDrag:function(e){var t=this._marker,n=t._shadow,r=Nt(t._icon),i=t._map.layerPointToLatLng(r);n&&U(n,r),t._latlng=i,e.latlng=i,e.oldLatLng=this._oldLatLng,t.fire(`move`,e).fire(`drag`,e)},_onDragEnd:function(e){S(this._panRequest),delete this._oldLatLng,this._marker.fire(`moveend`).fire(`dragend`,e)}}),or=Zn.extend({options:{icon:new ir,interactive:!0,keyboard:!0,title:``,alt:`Marker`,zIndexOffset:0,opacity:1,riseOnHover:!1,riseOffset:250,pane:`markerPane`,shadowPane:`shadowPane`,bubblingMouseEvents:!1,autoPanOnFocus:!0,draggable:!1,autoPan:!1,autoPanPadding:[50,50],autoPanSpeed:10},initialize:function(e,t){p(this,t),this._latlng=N(e)},onAdd:function(e){this._zoomAnimated=this._zoomAnimated&&e.options.markerZoomAnimation,this._zoomAnimated&&e.on(`zoomanim`,this._animateZoom,this),this._initIcon(),this.update()},onRemove:function(e){this.dragging&&this.dragging.enabled()&&(this.options.draggable=!0,this.dragging.removeHooks()),delete this.dragging,this._zoomAnimated&&e.off(`zoomanim`,this._animateZoom,this),this._removeIcon(),this._removeShadow()},getEvents:function(){return{zoom:this.update,viewreset:this.update}},getLatLng:function(){return this._latlng},setLatLng:function(e){var t=this._latlng;return this._latlng=N(e),this.update(),this.fire(`move`,{oldLatLng:t,latlng:this._latlng})},setZIndexOffset:function(e){return this.options.zIndexOffset=e,this.update()},getIcon:function(){return this.options.icon},setIcon:function(e){return this.options.icon=e,this._map&&(this._initIcon(),this.update()),this._popup&&this.bindPopup(this._popup,this._popup.options),this},getElement:function(){return this._icon},update:function(){if(this._icon&&this._map){var e=this._map.latLngToLayerPoint(this._latlng).round();this._setPos(e)}return this},_initIcon:function(){var e=this.options,t=`leaflet-zoom-`+(this._zoomAnimated?`animated`:`hide`),n=e.icon.createIcon(this._icon),r=!1;n!==this._icon&&(this._icon&&this._removeIcon(),r=!0,e.title&&(n.title=e.title),n.tagName===`IMG`&&(n.alt=e.alt||``)),V(n,t),e.keyboard&&(n.tabIndex=`0`,n.setAttribute(`role`,`button`)),this._icon=n,e.riseOnHover&&this.on({mouseover:this._bringToFront,mouseout:this._resetZIndex}),this.options.autoPanOnFocus&&W(n,`focus`,this._panOnFocus,this);var i=e.icon.createShadow(this._shadow),a=!1;i!==this._shadow&&(this._removeShadow(),a=!0),i&&(V(i,t),i.alt=``),this._shadow=i,e.opacity<1&&this._updateOpacity(),r&&this.getPane().appendChild(this._icon),this._initInteraction(),i&&a&&this.getPane(e.shadowPane).appendChild(this._shadow)},_removeIcon:function(){this.options.riseOnHover&&this.off({mouseover:this._bringToFront,mouseout:this._resetZIndex}),this.options.autoPanOnFocus&&G(this._icon,`focus`,this._panOnFocus,this),B(this._icon),this.removeInteractiveTarget(this._icon),this._icon=null},_removeShadow:function(){this._shadow&&B(this._shadow),this._shadow=null},_setPos:function(e){this._icon&&U(this._icon,e),this._shadow&&U(this._shadow,e),this._zIndex=e.y+this.options.zIndexOffset,this._resetZIndex()},_updateZIndex:function(e){this._icon&&(this._icon.style.zIndex=this._zIndex+e)},_animateZoom:function(e){var t=this._map._latLngToNewLayerPoint(this._latlng,e.zoom,e.center).round();this._setPos(t)},_initInteraction:function(){if(this.options.interactive&&(V(this._icon,`leaflet-interactive`),this.addInteractiveTarget(this._icon),ar)){var e=this.options.draggable;this.dragging&&(e=this.dragging.enabled(),this.dragging.disable()),this.dragging=new ar(this),e&&this.dragging.enable()}},setOpacity:function(e){return this.options.opacity=e,this._map&&this._updateOpacity(),this},_updateOpacity:function(){var e=this.options.opacity;this._icon&&kt(this._icon,e),this._shadow&&kt(this._shadow,e)},_bringToFront:function(){this._updateZIndex(this.options.riseOffset)},_resetZIndex:function(){this._updateZIndex(0)},_panOnFocus:function(){var e=this._map;if(e){var t=this.options.icon.options,n=t.iconSize?D(t.iconSize):D(0,0),r=t.iconAnchor?D(t.iconAnchor):D(0,0);e.panInside(this._latlng,{paddingTopLeft:r,paddingBottomRight:n.subtract(r)})}},_getPopupAnchor:function(){return this.options.icon.options.popupAnchor},_getTooltipAnchor:function(){return this.options.icon.options.tooltipAnchor}});function sr(e,t){return new or(e,t)}var cr=Zn.extend({options:{stroke:!0,color:`#3388ff`,weight:3,opacity:1,lineCap:`round`,lineJoin:`round`,dashArray:null,dashOffset:null,fill:!1,fillColor:null,fillOpacity:.2,fillRule:`evenodd`,interactive:!0,bubblingMouseEvents:!0},beforeAdd:function(e){this._renderer=e.getRenderer(this)},onAdd:function(){this._renderer._initPath(this),this._reset(),this._renderer._addPath(this)},onRemove:function(){this._renderer._removePath(this)},redraw:function(){return this._map&&this._renderer._updatePath(this),this},setStyle:function(e){return p(this,e),this._renderer&&(this._renderer._updateStyle(this),this.options.stroke&&e&&Object.prototype.hasOwnProperty.call(e,`weight`)&&this._updateBounds()),this},bringToFront:function(){return this._renderer&&this._renderer._bringToFront(this),this},bringToBack:function(){return this._renderer&&this._renderer._bringToBack(this),this},getElement:function(){return this._path},_reset:function(){this._project(),this._update()},_clickTolerance:function(){return(this.options.stroke?this.options.weight/2:0)+(this._renderer.options.tolerance||0)}}),lr=cr.extend({options:{fill:!0,radius:10},initialize:function(e,t){p(this,t),this._latlng=N(e),this._radius=this.options.radius},setLatLng:function(e){var t=this._latlng;return this._latlng=N(e),this.redraw(),this.fire(`move`,{oldLatLng:t,latlng:this._latlng})},getLatLng:function(){return this._latlng},setRadius:function(e){return this.options.radius=this._radius=e,this.redraw()},getRadius:function(){return this._radius},setStyle:function(e){var t=e&&e.radius||this._radius;return cr.prototype.setStyle.call(this,e),this.setRadius(t),this},_project:function(){this._point=this._map.latLngToLayerPoint(this._latlng),this._updateBounds()},_updateBounds:function(){var e=this._radius,t=this._radiusY||e,n=this._clickTolerance(),r=[e+n,t+n];this._pxBounds=new O(this._point.subtract(r),this._point.add(r))},_update:function(){this._map&&this._updatePath()},_updatePath:function(){this._renderer._updateCircle(this)},_empty:function(){return this._radius&&!this._renderer._bounds.intersects(this._pxBounds)},_containsPoint:function(e){return e.distanceTo(this._point)<=this._radius+this._clickTolerance()}});function ur(e,t){return new lr(e,t)}var q=lr.extend({initialize:function(e,t,r){if(typeof t==`number`&&(t=n({},r,{radius:t})),p(this,t),this._latlng=N(e),isNaN(this.options.radius))throw Error(`Circle radius cannot be NaN`);this._mRadius=this.options.radius},setRadius:function(e){return this._mRadius=e,this.redraw()},getRadius:function(){return this._mRadius},getBounds:function(){var e=[this._radius,this._radiusY||this._radius];return new A(this._map.layerPointToLatLng(this._point.subtract(e)),this._map.layerPointToLatLng(this._point.add(e)))},setStyle:cr.prototype.setStyle,_project:function(){var e=this._latlng.lng,t=this._latlng.lat,n=this._map,r=n.options.crs;if(r.distance===P.distance){var i=Math.PI/180,a=this._mRadius/P.R/i,o=n.project([t+a,e]),s=n.project([t-a,e]),c=o.add(s).divideBy(2),l=n.unproject(c).lat,u=Math.acos((Math.cos(a*i)-Math.sin(t*i)*Math.sin(l*i))/(Math.cos(t*i)*Math.cos(l*i)))/i;(isNaN(u)||u===0)&&(u=a/Math.cos(Math.PI/180*t)),this._point=c.subtract(n.getPixelOrigin()),this._radius=isNaN(u)?0:c.x-n.project([l,e-u]).x,this._radiusY=c.y-o.y}else{var d=r.unproject(r.project(this._latlng).subtract([this._mRadius,0]));this._point=n.latLngToLayerPoint(this._latlng),this._radius=this._point.x-n.latLngToLayerPoint(d).x}this._updateBounds()}});function dr(e,t,n){return new q(e,t,n)}var J=cr.extend({options:{smoothFactor:1,noClip:!1},initialize:function(e,t){p(this,t),this._setLatLngs(e)},getLatLngs:function(){return this._latlngs},setLatLngs:function(e){return this._setLatLngs(e),this.redraw()},isEmpty:function(){return!this._latlngs.length},closestLayerPoint:function(e){for(var t=1/0,n=null,r=Bn,i,a,o=0,s=this._parts.length;o<s;o++)for(var c=this._parts[o],l=1,u=c.length;l<u;l++){i=c[l-1],a=c[l];var d=r(e,i,a,!0);d<t&&(t=d,n=r(e,i,a))}return n&&(n.distance=Math.sqrt(t)),n},getCenter:function(){if(!this._map)throw Error(`Must add layer to map before using getCenter()`);return Un(this._defaultShape(),this._map.options.crs)},getBounds:function(){return this._bounds},addLatLng:function(e,t){return t||=this._defaultShape(),e=N(e),t.push(e),this._bounds.extend(e),this.redraw()},_setLatLngs:function(e){this._bounds=new A,this._latlngs=this._convertLatLngs(e)},_defaultShape:function(){return Vn(this._latlngs)?this._latlngs:this._latlngs[0]},_convertLatLngs:function(e){for(var t=[],n=Vn(e),r=0,i=e.length;r<i;r++)n?(t[r]=N(e[r]),this._bounds.extend(t[r])):t[r]=this._convertLatLngs(e[r]);return t},_project:function(){var e=new O;this._rings=[],this._projectLatlngs(this._latlngs,this._rings,e),this._bounds.isValid()&&e.isValid()&&(this._rawPxBounds=e,this._updateBounds())},_updateBounds:function(){var e=this._clickTolerance(),t=new E(e,e);this._rawPxBounds&&(this._pxBounds=new O([this._rawPxBounds.min.subtract(t),this._rawPxBounds.max.add(t)]))},_projectLatlngs:function(e,t,n){var r=e[0]instanceof M,i=e.length,a,o;if(r){for(o=[],a=0;a<i;a++)o[a]=this._map.latLngToLayerPoint(e[a]),n.extend(o[a]);t.push(o)}else for(a=0;a<i;a++)this._projectLatlngs(e[a],t,n)},_clipPoints:function(){var e=this._renderer._bounds;if(this._parts=[],!(!this._pxBounds||!this._pxBounds.intersects(e))){if(this.options.noClip){this._parts=this._rings;return}var t=this._parts,n,r,i,a,o,s,c;for(n=0,i=0,a=this._rings.length;n<a;n++)for(c=this._rings[n],r=0,o=c.length;r<o-1;r++)s=In(c[r],c[r+1],e,r,!0),s&&(t[i]=t[i]||[],t[i].push(s[0]),(s[1]!==c[r+1]||r===o-2)&&(t[i].push(s[1]),i++))}},_simplifyPoints:function(){for(var e=this._parts,t=this.options.smoothFactor,n=0,r=e.length;n<r;n++)e[n]=kn(e[n],t)},_update:function(){this._map&&(this._clipPoints(),this._simplifyPoints(),this._updatePath())},_updatePath:function(){this._renderer._updatePoly(this)},_containsPoint:function(e,t){var n,r,i,a,o,s,c=this._clickTolerance();if(!this._pxBounds||!this._pxBounds.contains(e))return!1;for(n=0,a=this._parts.length;n<a;n++)for(s=this._parts[n],r=0,o=s.length,i=o-1;r<o;i=r++)if(!(!t&&r===0)&&An(e,s[i],s[r])<=c)return!0;return!1}});function fr(e,t){return new J(e,t)}J._flat=Hn;var pr=J.extend({options:{fill:!0},isEmpty:function(){return!this._latlngs.length||!this._latlngs[0].length},getCenter:function(){if(!this._map)throw Error(`Must add layer to map before using getCenter()`);return En(this._defaultShape(),this._map.options.crs)},_convertLatLngs:function(e){var t=J.prototype._convertLatLngs.call(this,e),n=t.length;return n>=2&&t[0]instanceof M&&t[0].equals(t[n-1])&&t.pop(),t},_setLatLngs:function(e){J.prototype._setLatLngs.call(this,e),Vn(this._latlngs)&&(this._latlngs=[this._latlngs])},_defaultShape:function(){return Vn(this._latlngs[0])?this._latlngs[0]:this._latlngs[0][0]},_clipPoints:function(){var e=this._renderer._bounds,t=this.options.weight,n=new E(t,t);if(e=new O(e.min.subtract(n),e.max.add(n)),this._parts=[],!(!this._pxBounds||!this._pxBounds.intersects(e))){if(this.options.noClip){this._parts=this._rings;return}for(var r=0,i=this._rings.length,a;r<i;r++)a=Tn(this._rings[r],e,!0),a.length&&this._parts.push(a)}},_updatePath:function(){this._renderer._updatePoly(this,!0)},_containsPoint:function(e){var t=!1,n,r,i,a,o,s,c,l;if(!this._pxBounds||!this._pxBounds.contains(e))return!1;for(a=0,c=this._parts.length;a<c;a++)for(n=this._parts[a],o=0,l=n.length,s=l-1;o<l;s=o++)r=n[o],i=n[s],r.y>e.y!=i.y>e.y&&e.x<(i.x-r.x)*(e.y-r.y)/(i.y-r.y)+r.x&&(t=!t);return t||J.prototype._containsPoint.call(this,e,!0)}});function mr(e,t){return new pr(e,t)}var hr=er.extend({initialize:function(e,t){p(this,t),this._layers={},e&&this.addData(e)},addData:function(e){var t=_(e)?e:e.features,n,r,i;if(t){for(n=0,r=t.length;n<r;n++)i=t[n],(i.geometries||i.geometry||i.features||i.coordinates)&&this.addData(i);return this}var a=this.options;if(a.filter&&!a.filter(e))return this;var o=gr(e,a);return o?(o.feature=Cr(e),o.defaultOptions=o.options,this.resetStyle(o),a.onEachFeature&&a.onEachFeature(e,o),this.addLayer(o)):this},resetStyle:function(e){return e===void 0?this.eachLayer(this.resetStyle,this):(e.options=n({},e.defaultOptions),this._setLayerStyle(e,this.options.style),this)},setStyle:function(e){return this.eachLayer(function(t){this._setLayerStyle(t,e)},this)},_setLayerStyle:function(e,t){e.setStyle&&(typeof t==`function`&&(t=t(e.feature)),e.setStyle(t))}});function gr(e,t){var n=e.type===`Feature`?e.geometry:e,r=n?n.coordinates:null,i=[],a=t&&t.pointToLayer,o=t&&t.coordsToLatLng||vr,s,c,l,u;if(!r&&!n)return null;switch(n.type){case`Point`:return s=o(r),_r(a,e,s,t);case`MultiPoint`:for(l=0,u=r.length;l<u;l++)s=o(r[l]),i.push(_r(a,e,s,t));return new er(i);case`LineString`:case`MultiLineString`:return c=yr(r,n.type===`LineString`?0:1,o),new J(c,t);case`Polygon`:case`MultiPolygon`:return c=yr(r,n.type===`Polygon`?1:2,o),new pr(c,t);case`GeometryCollection`:for(l=0,u=n.geometries.length;l<u;l++){var d=gr({geometry:n.geometries[l],type:`Feature`,properties:e.properties},t);d&&i.push(d)}return new er(i);case`FeatureCollection`:for(l=0,u=n.features.length;l<u;l++){var f=gr(n.features[l],t);f&&i.push(f)}return new er(i);default:throw Error(`Invalid GeoJSON object.`)}}function _r(e,t,n,r){return e?e(t,n):new or(n,r&&r.markersInheritOptions&&r)}function vr(e){return new M(e[1],e[0],e[2])}function yr(e,t,n){for(var r=[],i=0,a=e.length,o;i<a;i++)o=t?yr(e[i],t-1,n):(n||vr)(e[i]),r.push(o);return r}function br(e,t){return e=N(e),e.alt===void 0?[u(e.lng,t),u(e.lat,t)]:[u(e.lng,t),u(e.lat,t),u(e.alt,t)]}function xr(e,t,n,r){for(var i=[],a=0,o=e.length;a<o;a++)i.push(t?xr(e[a],Vn(e[a])?0:t-1,n,r):br(e[a],r));return!t&&n&&i.length>0&&i.push(i[0].slice()),i}function Sr(e,t){return e.feature?n({},e.feature,{geometry:t}):Cr(t)}function Cr(e){return e.type===`Feature`||e.type===`FeatureCollection`?e:{type:`Feature`,properties:{},geometry:e}}var wr={toGeoJSON:function(e){return Sr(this,{type:`Point`,coordinates:br(this.getLatLng(),e)})}};or.include(wr),q.include(wr),lr.include(wr),J.include({toGeoJSON:function(e){var t=!Vn(this._latlngs),n=xr(this._latlngs,+!!t,!1,e);return Sr(this,{type:(t?`Multi`:``)+`LineString`,coordinates:n})}}),pr.include({toGeoJSON:function(e){var t=!Vn(this._latlngs),n=t&&!Vn(this._latlngs[0]),r=xr(this._latlngs,n?2:+!!t,!0,e);return t||(r=[r]),Sr(this,{type:(n?`Multi`:``)+`Polygon`,coordinates:r})}}),Qn.include({toMultiPoint:function(e){var t=[];return this.eachLayer(function(n){t.push(n.toGeoJSON(e).geometry.coordinates)}),Sr(this,{type:`MultiPoint`,coordinates:t})},toGeoJSON:function(e){var t=this.feature&&this.feature.geometry&&this.feature.geometry.type;if(t===`MultiPoint`)return this.toMultiPoint(e);var n=t===`GeometryCollection`,r=[];return this.eachLayer(function(t){if(t.toGeoJSON){var i=t.toGeoJSON(e);if(n)r.push(i.geometry);else{var a=Cr(i);a.type===`FeatureCollection`?r.push.apply(r,a.features):r.push(a)}}}),n?Sr(this,{geometries:r,type:`GeometryCollection`}):{type:`FeatureCollection`,features:r}}});function Tr(e,t){return new hr(e,t)}var Er=Tr,Dr=Zn.extend({options:{opacity:1,alt:``,interactive:!1,crossOrigin:!1,errorOverlayUrl:``,zIndex:1,className:``},initialize:function(e,t,n){this._url=e,this._bounds=j(t),p(this,n)},onAdd:function(){this._image||(this._initImage(),this.options.opacity<1&&this._updateOpacity()),this.options.interactive&&(V(this._image,`leaflet-interactive`),this.addInteractiveTarget(this._image)),this.getPane().appendChild(this._image),this._reset()},onRemove:function(){B(this._image),this.options.interactive&&this.removeInteractiveTarget(this._image)},setOpacity:function(e){return this.options.opacity=e,this._image&&this._updateOpacity(),this},setStyle:function(e){return e.opacity&&this.setOpacity(e.opacity),this},bringToFront:function(){return this._map&&wt(this._image),this},bringToBack:function(){return this._map&&Tt(this._image),this},setUrl:function(e){return this._url=e,this._image&&(this._image.src=e),this},setBounds:function(e){return this._bounds=j(e),this._map&&this._reset(),this},getEvents:function(){var e={zoom:this._reset,viewreset:this._reset};return this._zoomAnimated&&(e.zoomanim=this._animateZoom),e},setZIndex:function(e){return this.options.zIndex=e,this._updateZIndex(),this},getBounds:function(){return this._bounds},getElement:function(){return this._image},_initImage:function(){var e=this._url.tagName===`IMG`,t=this._image=e?this._url:z(`img`);if(V(t,`leaflet-image-layer`),this._zoomAnimated&&V(t,`leaflet-zoom-animated`),this.options.className&&V(t,this.options.className),t.onselectstart=l,t.onmousemove=l,t.onload=i(this.fire,this,`load`),t.onerror=i(this._overlayOnError,this,`error`),(this.options.crossOrigin||this.options.crossOrigin===``)&&(t.crossOrigin=this.options.crossOrigin===!0?``:this.options.crossOrigin),this.options.zIndex&&this._updateZIndex(),e){this._url=t.src;return}t.src=this._url,t.alt=this.options.alt},_animateZoom:function(e){var t=this._map.getZoomScale(e.zoom),n=this._map._latLngBoundsToNewLayerBounds(this._bounds,e.zoom,e.center).min;Mt(this._image,n,t)},_reset:function(){var e=this._image,t=new O(this._map.latLngToLayerPoint(this._bounds.getNorthWest()),this._map.latLngToLayerPoint(this._bounds.getSouthEast())),n=t.getSize();U(e,t.min),e.style.width=n.x+`px`,e.style.height=n.y+`px`},_updateOpacity:function(){kt(this._image,this.options.opacity)},_updateZIndex:function(){this._image&&this.options.zIndex!==void 0&&this.options.zIndex!==null&&(this._image.style.zIndex=this.options.zIndex)},_overlayOnError:function(){this.fire(`error`);var e=this.options.errorOverlayUrl;e&&this._url!==e&&(this._url=e,this._image.src=e)},getCenter:function(){return this._bounds.getCenter()}}),Or=function(e,t,n){return new Dr(e,t,n)},Y=Dr.extend({options:{autoplay:!0,loop:!0,keepAspectRatio:!0,muted:!1,playsInline:!0},_initImage:function(){var e=this._url.tagName===`VIDEO`,t=this._image=e?this._url:z(`video`);if(V(t,`leaflet-image-layer`),this._zoomAnimated&&V(t,`leaflet-zoom-animated`),this.options.className&&V(t,this.options.className),t.onselectstart=l,t.onmousemove=l,t.onloadeddata=i(this.fire,this,`load`),e){for(var n=t.getElementsByTagName(`source`),r=[],a=0;a<n.length;a++)r.push(n[a].src);this._url=n.length>0?r:[t.src];return}_(this._url)||(this._url=[this._url]),!this.options.keepAspectRatio&&Object.prototype.hasOwnProperty.call(t.style,`objectFit`)&&(t.style.objectFit=`fill`),t.autoplay=!!this.options.autoplay,t.loop=!!this.options.loop,t.muted=!!this.options.muted,t.playsInline=!!this.options.playsInline;for(var o=0;o<this._url.length;o++){var s=z(`source`);s.src=this._url[o],t.appendChild(s)}}});function kr(e,t,n){return new Y(e,t,n)}var Ar=Dr.extend({_initImage:function(){var e=this._image=this._url;V(e,`leaflet-image-layer`),this._zoomAnimated&&V(e,`leaflet-zoom-animated`),this.options.className&&V(e,this.options.className),e.onselectstart=l,e.onmousemove=l}});function jr(e,t,n){return new Ar(e,t,n)}var Mr=Zn.extend({options:{interactive:!1,offset:[0,0],className:``,pane:void 0,content:``},initialize:function(e,t){e&&(e instanceof M||_(e))?(this._latlng=N(e),p(this,t)):(p(this,e),this._source=t),this.options.content&&(this._content=this.options.content)},openOn:function(e){return e=arguments.length?e:this._source._map,e.hasLayer(this)||e.addLayer(this),this},close:function(){return this._map&&this._map.removeLayer(this),this},toggle:function(e){return this._map?this.close():(arguments.length?this._source=e:e=this._source,this._prepareOpen(),this.openOn(e._map)),this},onAdd:function(e){this._zoomAnimated=e._zoomAnimated,this._container||this._initLayout(),e._fadeAnimated&&kt(this._container,0),clearTimeout(this._removeTimeout),this.getPane().appendChild(this._container),this.update(),e._fadeAnimated&&kt(this._container,1),this.bringToFront(),this.options.interactive&&(V(this._container,`leaflet-interactive`),this.addInteractiveTarget(this._container))},onRemove:function(e){e._fadeAnimated?(kt(this._container,0),this._removeTimeout=setTimeout(i(B,void 0,this._container),200)):B(this._container),this.options.interactive&&(H(this._container,`leaflet-interactive`),this.removeInteractiveTarget(this._container))},getLatLng:function(){return this._latlng},setLatLng:function(e){return this._latlng=N(e),this._map&&(this._updatePosition(),this._adjustPan()),this},getContent:function(){return this._content},setContent:function(e){return this._content=e,this.update(),this},getElement:function(){return this._container},update:function(){this._map&&(this._container.style.visibility=`hidden`,this._updateContent(),this._updateLayout(),this._updatePosition(),this._container.style.visibility=``,this._adjustPan())},getEvents:function(){var e={zoom:this._updatePosition,viewreset:this._updatePosition};return this._zoomAnimated&&(e.zoomanim=this._animateZoom),e},isOpen:function(){return!!this._map&&this._map.hasLayer(this)},bringToFront:function(){return this._map&&wt(this._container),this},bringToBack:function(){return this._map&&Tt(this._container),this},_prepareOpen:function(e){var t=this._source;if(!t._map)return!1;if(t instanceof er){t=null;var n=this._source._layers;for(var r in n)if(n[r]._map){t=n[r];break}if(!t)return!1;this._source=t}if(!e)if(t.getCenter)e=t.getCenter();else if(t.getLatLng)e=t.getLatLng();else if(t.getBounds)e=t.getBounds().getCenter();else throw Error(`Unable to get source layer LatLng.`);return this.setLatLng(e),this._map&&this.update(),!0},_updateContent:function(){if(this._content){var e=this._contentNode,t=typeof this._content==`function`?this._content(this._source||this):this._content;if(typeof t==`string`)e.innerHTML=t;else{for(;e.hasChildNodes();)e.removeChild(e.firstChild);e.appendChild(t)}this.fire(`contentupdate`)}},_updatePosition:function(){if(this._map){var e=this._map.latLngToLayerPoint(this._latlng),t=D(this.options.offset),n=this._getAnchor();this._zoomAnimated?U(this._container,e.add(n)):t=t.add(e).add(n);var r=this._containerBottom=-t.y,i=this._containerLeft=-Math.round(this._containerWidth/2)+t.x;this._container.style.bottom=r+`px`,this._container.style.left=i+`px`}},_getAnchor:function(){return[0,0]}});K.include({_initOverlay:function(e,t,n,r){var i=t;return i instanceof e||(i=new e(r).setContent(t)),n&&i.setLatLng(n),i}}),Zn.include({_initOverlay:function(e,t,n,r){var i=n;return i instanceof e?(p(i,r),i._source=this):(i=t&&!r?t:new e(r,this),i.setContent(n)),i}});var Nr=Mr.extend({options:{pane:`popupPane`,offset:[0,7],maxWidth:300,minWidth:50,maxHeight:null,autoPan:!0,autoPanPaddingTopLeft:null,autoPanPaddingBottomRight:null,autoPanPadding:[5,5],keepInView:!1,closeButton:!0,autoClose:!0,closeOnEscapeKey:!0,className:``},openOn:function(e){return e=arguments.length?e:this._source._map,!e.hasLayer(this)&&e._popup&&e._popup.options.autoClose&&e.removeLayer(e._popup),e._popup=this,Mr.prototype.openOn.call(this,e)},onAdd:function(e){Mr.prototype.onAdd.call(this,e),e.fire(`popupopen`,{popup:this}),this._source&&(this._source.fire(`popupopen`,{popup:this},!0),this._source instanceof cr||this._source.on(`preclick`,Qt))},onRemove:function(e){Mr.prototype.onRemove.call(this,e),e.fire(`popupclose`,{popup:this}),this._source&&(this._source.fire(`popupclose`,{popup:this},!0),this._source instanceof cr||this._source.off(`preclick`,Qt))},getEvents:function(){var e=Mr.prototype.getEvents.call(this);return(this.options.closeOnClick===void 0?this._map.options.closePopupOnClick:this.options.closeOnClick)&&(e.preclick=this.close),this.options.keepInView&&(e.moveend=this._adjustPan),e},_initLayout:function(){var e=`leaflet-popup`,t=this._container=z(`div`,e+` `+(this.options.className||``)+` leaflet-zoom-animated`),n=this._wrapper=z(`div`,e+`-content-wrapper`,t);if(this._contentNode=z(`div`,e+`-content`,n),en(t),$t(this._contentNode),W(t,`contextmenu`,Qt),this._tipContainer=z(`div`,e+`-tip-container`,t),this._tip=z(`div`,e+`-tip`,this._tipContainer),this.options.closeButton){var r=this._closeButton=z(`a`,e+`-close-button`,t);r.setAttribute(`role`,`button`),r.setAttribute(`aria-label`,`Close popup`),r.href=`#close`,r.innerHTML=`<span aria-hidden="true">&#215;</span>`,W(r,`click`,function(e){tn(e),this.close()},this)}},_updateLayout:function(){var e=this._contentNode,t=e.style;t.width=``,t.whiteSpace=`nowrap`;var n=e.offsetWidth;n=Math.min(n,this.options.maxWidth),n=Math.max(n,this.options.minWidth),t.width=n+1+`px`,t.whiteSpace=``,t.height=``;var r=e.offsetHeight,i=this.options.maxHeight,a=`leaflet-popup-scrolled`;i&&r>i?(t.height=i+`px`,V(e,a)):H(e,a),this._containerWidth=this._container.offsetWidth},_animateZoom:function(e){var t=this._map._latLngToNewLayerPoint(this._latlng,e.zoom,e.center),n=this._getAnchor();U(this._container,t.add(n))},_adjustPan:function(){if(this.options.autoPan){if(this._map._panAnim&&this._map._panAnim.stop(),this._autopanning){this._autopanning=!1;return}var e=this._map,t=parseInt(St(this._container,`marginBottom`),10)||0,n=this._container.offsetHeight+t,r=this._containerWidth,i=new E(this._containerLeft,-n-this._containerBottom);i._add(Nt(this._container));var a=e.layerPointToContainerPoint(i),o=D(this.options.autoPanPadding),s=D(this.options.autoPanPaddingTopLeft||o),c=D(this.options.autoPanPaddingBottomRight||o),l=e.getSize(),u=0,d=0;a.x+r+c.x>l.x&&(u=a.x+r-l.x+c.x),a.x-u-s.x<0&&(u=a.x-s.x),a.y+n+c.y>l.y&&(d=a.y+n-l.y+c.y),a.y-d-s.y<0&&(d=a.y-s.y),(u||d)&&(this.options.keepInView&&(this._autopanning=!0),e.fire(`autopanstart`).panBy([u,d]))}},_getAnchor:function(){return D(this._source&&this._source._getPopupAnchor?this._source._getPopupAnchor():[0,0])}}),Pr=function(e,t){return new Nr(e,t)};K.mergeOptions({closePopupOnClick:!0}),K.include({openPopup:function(e,t,n){return this._initOverlay(Nr,e,t,n).openOn(this),this},closePopup:function(e){return e=arguments.length?e:this._popup,e&&e.close(),this}}),Zn.include({bindPopup:function(e,t){return this._popup=this._initOverlay(Nr,this._popup,e,t),this._popupHandlersAdded||=(this.on({click:this._openPopup,keypress:this._onKeyPress,remove:this.closePopup,move:this._movePopup}),!0),this},unbindPopup:function(){return this._popup&&=(this.off({click:this._openPopup,keypress:this._onKeyPress,remove:this.closePopup,move:this._movePopup}),this._popupHandlersAdded=!1,null),this},openPopup:function(e){return this._popup&&(this instanceof er||(this._popup._source=this),this._popup._prepareOpen(e||this._latlng)&&this._popup.openOn(this._map)),this},closePopup:function(){return this._popup&&this._popup.close(),this},togglePopup:function(){return this._popup&&this._popup.toggle(this),this},isPopupOpen:function(){return this._popup?this._popup.isOpen():!1},setPopupContent:function(e){return this._popup&&this._popup.setContent(e),this},getPopup:function(){return this._popup},_openPopup:function(e){if(!(!this._popup||!this._map)){nn(e);var t=e.layer||e.target;if(this._popup._source===t&&!(t instanceof cr)){this._map.hasLayer(this._popup)?this.closePopup():this.openPopup(e.latlng);return}this._popup._source=t,this.openPopup(e.latlng)}},_movePopup:function(e){this._popup.setLatLng(e.latlng)},_onKeyPress:function(e){e.originalEvent.keyCode===13&&this._openPopup(e)}});var Fr=Mr.extend({options:{pane:`tooltipPane`,offset:[0,0],direction:`auto`,permanent:!1,sticky:!1,opacity:.9},onAdd:function(e){Mr.prototype.onAdd.call(this,e),this.setOpacity(this.options.opacity),e.fire(`tooltipopen`,{tooltip:this}),this._source&&(this.addEventParent(this._source),this._source.fire(`tooltipopen`,{tooltip:this},!0))},onRemove:function(e){Mr.prototype.onRemove.call(this,e),e.fire(`tooltipclose`,{tooltip:this}),this._source&&(this.removeEventParent(this._source),this._source.fire(`tooltipclose`,{tooltip:this},!0))},getEvents:function(){var e=Mr.prototype.getEvents.call(this);return this.options.permanent||(e.preclick=this.close),e},_initLayout:function(){var e=`leaflet-tooltip `+(this.options.className||``)+` leaflet-zoom-`+(this._zoomAnimated?`animated`:`hide`);this._contentNode=this._container=z(`div`,e),this._container.setAttribute(`role`,`tooltip`),this._container.setAttribute(`id`,`leaflet-tooltip-`+o(this))},_updateLayout:function(){},_adjustPan:function(){},_setPosition:function(e){var t,n,r=this._map,i=this._container,a=r.latLngToContainerPoint(r.getCenter()),o=r.layerPointToContainerPoint(e),s=this.options.direction,c=i.offsetWidth,l=i.offsetHeight,u=D(this.options.offset),d=this._getAnchor();s===`top`?(t=c/2,n=l):s===`bottom`?(t=c/2,n=0):s===`center`?(t=c/2,n=l/2):s===`right`?(t=0,n=l/2):s===`left`?(t=c,n=l/2):o.x<a.x?(s=`right`,t=0,n=l/2):(s=`left`,t=c+(u.x+d.x)*2,n=l/2),e=e.subtract(D(t,n,!0)).add(u).add(d),H(i,`leaflet-tooltip-right`),H(i,`leaflet-tooltip-left`),H(i,`leaflet-tooltip-top`),H(i,`leaflet-tooltip-bottom`),V(i,`leaflet-tooltip-`+s),U(i,e)},_updatePosition:function(){var e=this._map.latLngToLayerPoint(this._latlng);this._setPosition(e)},setOpacity:function(e){this.options.opacity=e,this._container&&kt(this._container,e)},_animateZoom:function(e){var t=this._map._latLngToNewLayerPoint(this._latlng,e.zoom,e.center);this._setPosition(t)},_getAnchor:function(){return D(this._source&&this._source._getTooltipAnchor&&!this.options.sticky?this._source._getTooltipAnchor():[0,0])}}),Ir=function(e,t){return new Fr(e,t)};K.include({openTooltip:function(e,t,n){return this._initOverlay(Fr,e,t,n).openOn(this),this},closeTooltip:function(e){return e.close(),this}}),Zn.include({bindTooltip:function(e,t){return this._tooltip&&this.isTooltipOpen()&&this.unbindTooltip(),this._tooltip=this._initOverlay(Fr,this._tooltip,e,t),this._initTooltipInteractions(),this._tooltip.options.permanent&&this._map&&this._map.hasLayer(this)&&this.openTooltip(),this},unbindTooltip:function(){return this._tooltip&&=(this._initTooltipInteractions(!0),this.closeTooltip(),null),this},_initTooltipInteractions:function(e){if(!(!e&&this._tooltipHandlersAdded)){var t=e?`off`:`on`,n={remove:this.closeTooltip,move:this._moveTooltip};this._tooltip.options.permanent?n.add=this._openTooltip:(n.mouseover=this._openTooltip,n.mouseout=this.closeTooltip,n.click=this._openTooltip,this._map?this._addFocusListeners():n.add=this._addFocusListeners),this._tooltip.options.sticky&&(n.mousemove=this._moveTooltip),this[t](n),this._tooltipHandlersAdded=!e}},openTooltip:function(e){return this._tooltip&&(this instanceof er||(this._tooltip._source=this),this._tooltip._prepareOpen(e)&&(this._tooltip.openOn(this._map),this.getElement?this._setAriaDescribedByOnLayer(this):this.eachLayer&&this.eachLayer(this._setAriaDescribedByOnLayer,this))),this},closeTooltip:function(){if(this._tooltip)return this._tooltip.close()},toggleTooltip:function(){return this._tooltip&&this._tooltip.toggle(this),this},isTooltipOpen:function(){return this._tooltip.isOpen()},setTooltipContent:function(e){return this._tooltip&&this._tooltip.setContent(e),this},getTooltip:function(){return this._tooltip},_addFocusListeners:function(){this.getElement?this._addFocusListenersOnLayer(this):this.eachLayer&&this.eachLayer(this._addFocusListenersOnLayer,this)},_addFocusListenersOnLayer:function(e){var t=typeof e.getElement==`function`&&e.getElement();t&&(W(t,`focus`,function(){this._tooltip._source=e,this.openTooltip()},this),W(t,`blur`,this.closeTooltip,this))},_setAriaDescribedByOnLayer:function(e){var t=typeof e.getElement==`function`&&e.getElement();t&&t.setAttribute(`aria-describedby`,this._tooltip._container.id)},_openTooltip:function(e){if(!(!this._tooltip||!this._map)){if(this._map.dragging&&this._map.dragging.moving()&&!this._openOnceFlag){this._openOnceFlag=!0;var t=this;this._map.once(`moveend`,function(){t._openOnceFlag=!1,t._openTooltip(e)});return}this._tooltip._source=e.layer||e.target,this.openTooltip(this._tooltip.options.sticky?e.latlng:void 0)}},_moveTooltip:function(e){var t=e.latlng,n,r;this._tooltip.options.sticky&&e.originalEvent&&(n=this._map.mouseEventToContainerPoint(e.originalEvent),r=this._map.containerPointToLayerPoint(n),t=this._map.layerPointToLatLng(r)),this._tooltip.setLatLng(t)}});var Lr=nr.extend({options:{iconSize:[12,12],html:!1,bgPos:null,className:`leaflet-div-icon`},createIcon:function(e){var t=e&&e.tagName===`DIV`?e:document.createElement(`div`),n=this.options;if(n.html instanceof Element?(Ct(t),t.appendChild(n.html)):t.innerHTML=n.html===!1?``:n.html,n.bgPos){var r=D(n.bgPos);t.style.backgroundPosition=-r.x+`px `+-r.y+`px`}return this._setIconStyles(t,`icon`),t},createShadow:function(){return null}});function Rr(e){return new Lr(e)}nr.Default=ir;var zr=Zn.extend({options:{tileSize:256,opacity:1,updateWhenIdle:R.mobile,updateWhenZooming:!0,updateInterval:200,zIndex:1,bounds:null,minZoom:0,maxZoom:void 0,maxNativeZoom:void 0,minNativeZoom:void 0,noWrap:!1,pane:`tilePane`,className:``,keepBuffer:2},initialize:function(e){p(this,e)},onAdd:function(){this._initContainer(),this._levels={},this._tiles={},this._resetView()},beforeAdd:function(e){e._addZoomLimit(this)},onRemove:function(e){this._removeAllTiles(),B(this._container),e._removeZoomLimit(this),this._container=null,this._tileZoom=void 0},bringToFront:function(){return this._map&&(wt(this._container),this._setAutoZIndex(Math.max)),this},bringToBack:function(){return this._map&&(Tt(this._container),this._setAutoZIndex(Math.min)),this},getContainer:function(){return this._container},setOpacity:function(e){return this.options.opacity=e,this._updateOpacity(),this},setZIndex:function(e){return this.options.zIndex=e,this._updateZIndex(),this},isLoading:function(){return this._loading},redraw:function(){if(this._map){this._removeAllTiles();var e=this._clampZoom(this._map.getZoom());e!==this._tileZoom&&(this._tileZoom=e,this._updateLevels()),this._update()}return this},getEvents:function(){var e={viewprereset:this._invalidateAll,viewreset:this._resetView,zoom:this._resetView,moveend:this._onMoveEnd};return this.options.updateWhenIdle||(this._onMove||=s(this._onMoveEnd,this.options.updateInterval,this),e.move=this._onMove),this._zoomAnimated&&(e.zoomanim=this._animateZoom),e},createTile:function(){return document.createElement(`div`)},getTileSize:function(){var e=this.options.tileSize;return e instanceof E?e:new E(e,e)},_updateZIndex:function(){this._container&&this.options.zIndex!==void 0&&this.options.zIndex!==null&&(this._container.style.zIndex=this.options.zIndex)},_setAutoZIndex:function(e){for(var t=this.getPane().children,n=-e(-1/0,1/0),r=0,i=t.length,a;r<i;r++)a=t[r].style.zIndex,t[r]!==this._container&&a&&(n=e(n,+a));isFinite(n)&&(this.options.zIndex=n+e(-1,1),this._updateZIndex())},_updateOpacity:function(){if(this._map&&!R.ielt9){kt(this._container,this.options.opacity);var e=+new Date,t=!1,n=!1;for(var r in this._tiles){var i=this._tiles[r];if(!(!i.current||!i.loaded)){var a=Math.min(1,(e-i.loaded)/200);kt(i.el,a),a<1?t=!0:(i.active?n=!0:this._onOpaqueTile(i),i.active=!0)}}n&&!this._noPrune&&this._pruneTiles(),t&&(S(this._fadeFrame),this._fadeFrame=x(this._updateOpacity,this))}},_onOpaqueTile:l,_initContainer:function(){this._container||(this._container=z(`div`,`leaflet-layer `+(this.options.className||``)),this._updateZIndex(),this.options.opacity<1&&this._updateOpacity(),this.getPane().appendChild(this._container))},_updateLevels:function(){var e=this._tileZoom,t=this.options.maxZoom;if(e!==void 0){for(var n in this._levels)n=Number(n),this._levels[n].el.children.length||n===e?(this._levels[n].el.style.zIndex=t-Math.abs(e-n),this._onUpdateLevel(n)):(B(this._levels[n].el),this._removeTilesAtZoom(n),this._onRemoveLevel(n),delete this._levels[n]);var r=this._levels[e],i=this._map;return r||(r=this._levels[e]={},r.el=z(`div`,`leaflet-tile-container leaflet-zoom-animated`,this._container),r.el.style.zIndex=t,r.origin=i.project(i.unproject(i.getPixelOrigin()),e).round(),r.zoom=e,this._setZoomTransform(r,i.getCenter(),i.getZoom()),r.el.offsetWidth,this._onCreateLevel(r)),this._level=r,r}},_onUpdateLevel:l,_onRemoveLevel:l,_onCreateLevel:l,_pruneTiles:function(){if(this._map){var e,t,n=this._map.getZoom();if(n>this.options.maxZoom||n<this.options.minZoom){this._removeAllTiles();return}for(e in this._tiles)t=this._tiles[e],t.retain=t.current;for(e in this._tiles)if(t=this._tiles[e],t.current&&!t.active){var r=t.coords;this._retainParent(r.x,r.y,r.z,r.z-5)||this._retainChildren(r.x,r.y,r.z,r.z+2)}for(e in this._tiles)this._tiles[e].retain||this._removeTile(e)}},_removeTilesAtZoom:function(e){for(var t in this._tiles)this._tiles[t].coords.z===e&&this._removeTile(t)},_removeAllTiles:function(){for(var e in this._tiles)this._removeTile(e)},_invalidateAll:function(){for(var e in this._levels)B(this._levels[e].el),this._onRemoveLevel(Number(e)),delete this._levels[e];this._removeAllTiles(),this._tileZoom=void 0},_retainParent:function(e,t,n,r){var i=Math.floor(e/2),a=Math.floor(t/2),o=n-1,s=new E(+i,+a);s.z=+o;var c=this._tileCoordsToKey(s),l=this._tiles[c];return l&&l.active?(l.retain=!0,!0):(l&&l.loaded&&(l.retain=!0),o>r?this._retainParent(i,a,o,r):!1)},_retainChildren:function(e,t,n,r){for(var i=2*e;i<2*e+2;i++)for(var a=2*t;a<2*t+2;a++){var o=new E(i,a);o.z=n+1;var s=this._tileCoordsToKey(o),c=this._tiles[s];if(c&&c.active){c.retain=!0;continue}else c&&c.loaded&&(c.retain=!0);n+1<r&&this._retainChildren(i,a,n+1,r)}},_resetView:function(e){var t=e&&(e.pinch||e.flyTo);this._setView(this._map.getCenter(),this._map.getZoom(),t,t)},_animateZoom:function(e){this._setView(e.center,e.zoom,!0,e.noUpdate)},_clampZoom:function(e){var t=this.options;return t.minNativeZoom!==void 0&&e<t.minNativeZoom?t.minNativeZoom:t.maxNativeZoom!==void 0&&t.maxNativeZoom<e?t.maxNativeZoom:e},_setView:function(e,t,n,r){var i=Math.round(t);i=this.options.maxZoom!==void 0&&i>this.options.maxZoom||this.options.minZoom!==void 0&&i<this.options.minZoom?void 0:this._clampZoom(i);var a=this.options.updateWhenZooming&&i!==this._tileZoom;(!r||a)&&(this._tileZoom=i,this._abortLoading&&this._abortLoading(),this._updateLevels(),this._resetGrid(),i!==void 0&&this._update(e),n||this._pruneTiles(),this._noPrune=!!n),this._setZoomTransforms(e,t)},_setZoomTransforms:function(e,t){for(var n in this._levels)this._setZoomTransform(this._levels[n],e,t)},_setZoomTransform:function(e,t,n){var r=this._map.getZoomScale(n,e.zoom),i=e.origin.multiplyBy(r).subtract(this._map._getNewPixelOrigin(t,n)).round();R.any3d?Mt(e.el,i,r):U(e.el,i)},_resetGrid:function(){var e=this._map,t=e.options.crs,n=this._tileSize=this.getTileSize(),r=this._tileZoom,i=this._map.getPixelWorldBounds(this._tileZoom);i&&(this._globalTileRange=this._pxBoundsToTileRange(i)),this._wrapX=t.wrapLng&&!this.options.noWrap&&[Math.floor(e.project([0,t.wrapLng[0]],r).x/n.x),Math.ceil(e.project([0,t.wrapLng[1]],r).x/n.y)],this._wrapY=t.wrapLat&&!this.options.noWrap&&[Math.floor(e.project([t.wrapLat[0],0],r).y/n.x),Math.ceil(e.project([t.wrapLat[1],0],r).y/n.y)]},_onMoveEnd:function(){!this._map||this._map._animatingZoom||this._update()},_getTiledPixelBounds:function(e){var t=this._map,n=t._animatingZoom?Math.max(t._animateToZoom,t.getZoom()):t.getZoom(),r=t.getZoomScale(n,this._tileZoom),i=t.project(e,this._tileZoom).floor(),a=t.getSize().divideBy(r*2);return new O(i.subtract(a),i.add(a))},_update:function(e){var t=this._map;if(t){var n=this._clampZoom(t.getZoom());if(e===void 0&&(e=t.getCenter()),this._tileZoom!==void 0){var r=this._getTiledPixelBounds(e),i=this._pxBoundsToTileRange(r),a=i.getCenter(),o=[],s=this.options.keepBuffer,c=new O(i.getBottomLeft().subtract([s,-s]),i.getTopRight().add([s,-s]));if(!(isFinite(i.min.x)&&isFinite(i.min.y)&&isFinite(i.max.x)&&isFinite(i.max.y)))throw Error(`Attempted to load an infinite number of tiles`);for(var l in this._tiles){var u=this._tiles[l].coords;(u.z!==this._tileZoom||!c.contains(new E(u.x,u.y)))&&(this._tiles[l].current=!1)}if(Math.abs(n-this._tileZoom)>1){this._setView(e,n);return}for(var d=i.min.y;d<=i.max.y;d++)for(var f=i.min.x;f<=i.max.x;f++){var p=new E(f,d);if(p.z=this._tileZoom,this._isValidTile(p)){var m=this._tiles[this._tileCoordsToKey(p)];m?m.current=!0:o.push(p)}}if(o.sort(function(e,t){return e.distanceTo(a)-t.distanceTo(a)}),o.length!==0){this._loading||(this._loading=!0,this.fire(`loading`));var h=document.createDocumentFragment();for(f=0;f<o.length;f++)this._addTile(o[f],h);this._level.el.appendChild(h)}}}},_isValidTile:function(e){var t=this._map.options.crs;if(!t.infinite){var n=this._globalTileRange;if(!t.wrapLng&&(e.x<n.min.x||e.x>n.max.x)||!t.wrapLat&&(e.y<n.min.y||e.y>n.max.y))return!1}if(!this.options.bounds)return!0;var r=this._tileCoordsToBounds(e);return j(this.options.bounds).overlaps(r)},_keyToBounds:function(e){return this._tileCoordsToBounds(this._keyToTileCoords(e))},_tileCoordsToNwSe:function(e){var t=this._map,n=this.getTileSize(),r=e.scaleBy(n),i=r.add(n);return[t.unproject(r,e.z),t.unproject(i,e.z)]},_tileCoordsToBounds:function(e){var t=this._tileCoordsToNwSe(e),n=new A(t[0],t[1]);return this.options.noWrap||(n=this._map.wrapLatLngBounds(n)),n},_tileCoordsToKey:function(e){return e.x+`:`+e.y+`:`+e.z},_keyToTileCoords:function(e){var t=e.split(`:`),n=new E(+t[0],+t[1]);return n.z=+t[2],n},_removeTile:function(e){var t=this._tiles[e];t&&(B(t.el),delete this._tiles[e],this.fire(`tileunload`,{tile:t.el,coords:this._keyToTileCoords(e)}))},_initTile:function(e){V(e,`leaflet-tile`);var t=this.getTileSize();e.style.width=t.x+`px`,e.style.height=t.y+`px`,e.onselectstart=l,e.onmousemove=l,R.ielt9&&this.options.opacity<1&&kt(e,this.options.opacity)},_addTile:function(e,t){var n=this._getTilePos(e),r=this._tileCoordsToKey(e),a=this.createTile(this._wrapCoords(e),i(this._tileReady,this,e));this._initTile(a),this.createTile.length<2&&x(i(this._tileReady,this,e,null,a)),U(a,n),this._tiles[r]={el:a,coords:e,current:!0},t.appendChild(a),this.fire(`tileloadstart`,{tile:a,coords:e})},_tileReady:function(e,t,n){t&&this.fire(`tileerror`,{error:t,tile:n,coords:e});var r=this._tileCoordsToKey(e);n=this._tiles[r],n&&(n.loaded=+new Date,this._map._fadeAnimated?(kt(n.el,0),S(this._fadeFrame),this._fadeFrame=x(this._updateOpacity,this)):(n.active=!0,this._pruneTiles()),t||(V(n.el,`leaflet-tile-loaded`),this.fire(`tileload`,{tile:n.el,coords:e})),this._noTilesToLoad()&&(this._loading=!1,this.fire(`load`),R.ielt9||!this._map._fadeAnimated?x(this._pruneTiles,this):setTimeout(i(this._pruneTiles,this),250)))},_getTilePos:function(e){return e.scaleBy(this.getTileSize()).subtract(this._level.origin)},_wrapCoords:function(e){var t=new E(this._wrapX?c(e.x,this._wrapX):e.x,this._wrapY?c(e.y,this._wrapY):e.y);return t.z=e.z,t},_pxBoundsToTileRange:function(e){var t=this.getTileSize();return new O(e.min.unscaleBy(t).floor(),e.max.unscaleBy(t).ceil().subtract([1,1]))},_noTilesToLoad:function(){for(var e in this._tiles)if(!this._tiles[e].loaded)return!1;return!0}});function Br(e){return new zr(e)}var Vr=zr.extend({options:{minZoom:0,maxZoom:18,subdomains:`abc`,errorTileUrl:``,zoomOffset:0,tms:!1,zoomReverse:!1,detectRetina:!1,crossOrigin:!1,referrerPolicy:!1},initialize:function(e,t){this._url=e,t=p(this,t),t.detectRetina&&R.retina&&t.maxZoom>0?(t.tileSize=Math.floor(t.tileSize/2),t.zoomReverse?(t.zoomOffset--,t.minZoom=Math.min(t.maxZoom,t.minZoom+1)):(t.zoomOffset++,t.maxZoom=Math.max(t.minZoom,t.maxZoom-1)),t.minZoom=Math.max(0,t.minZoom)):t.zoomReverse?t.minZoom=Math.min(t.maxZoom,t.minZoom):t.maxZoom=Math.max(t.minZoom,t.maxZoom),typeof t.subdomains==`string`&&(t.subdomains=t.subdomains.split(``)),this.on(`tileunload`,this._onTileRemove)},setUrl:function(e,t){return this._url===e&&t===void 0&&(t=!0),this._url=e,t||this.redraw(),this},createTile:function(e,t){var n=document.createElement(`img`);return W(n,`load`,i(this._tileOnLoad,this,t,n)),W(n,`error`,i(this._tileOnError,this,t,n)),(this.options.crossOrigin||this.options.crossOrigin===``)&&(n.crossOrigin=this.options.crossOrigin===!0?``:this.options.crossOrigin),typeof this.options.referrerPolicy==`string`&&(n.referrerPolicy=this.options.referrerPolicy),n.alt=``,n.src=this.getTileUrl(e),n},getTileUrl:function(e){var t={r:R.retina?`@2x`:``,s:this._getSubdomain(e),x:e.x,y:e.y,z:this._getZoomForUrl()};if(this._map&&!this._map.options.crs.infinite){var r=this._globalTileRange.max.y-e.y;this.options.tms&&(t.y=r),t[`-y`]=r}return g(this._url,n(t,this.options))},_tileOnLoad:function(e,t){R.ielt9?setTimeout(i(e,this,null,t),0):e(null,t)},_tileOnError:function(e,t,n){var r=this.options.errorTileUrl;r&&t.getAttribute(`src`)!==r&&(t.src=r),e(n,t)},_onTileRemove:function(e){e.tile.onload=null},_getZoomForUrl:function(){var e=this._tileZoom,t=this.options.maxZoom,n=this.options.zoomReverse,r=this.options.zoomOffset;return n&&(e=t-e),e+r},_getSubdomain:function(e){var t=Math.abs(e.x+e.y)%this.options.subdomains.length;return this.options.subdomains[t]},_abortLoading:function(){var e,t;for(e in this._tiles)if(this._tiles[e].coords.z!==this._tileZoom&&(t=this._tiles[e].el,t.onload=l,t.onerror=l,!t.complete)){t.src=te;var n=this._tiles[e].coords;B(t),delete this._tiles[e],this.fire(`tileabort`,{tile:t,coords:n})}},_removeTile:function(e){var t=this._tiles[e];if(t)return t.el.setAttribute(`src`,te),zr.prototype._removeTile.call(this,e)},_tileReady:function(e,t,n){if(!(!this._map||n&&n.getAttribute(`src`)===te))return zr.prototype._tileReady.call(this,e,t,n)}});function Hr(e,t){return new Vr(e,t)}var Ur=Vr.extend({defaultWmsParams:{service:`WMS`,request:`GetMap`,layers:``,styles:``,format:`image/jpeg`,transparent:!1,version:`1.1.1`},options:{crs:null,uppercase:!1},initialize:function(e,t){this._url=e;var r=n({},this.defaultWmsParams);for(var i in t)i in this.options||(r[i]=t[i]);t=p(this,t);var a=t.detectRetina&&R.retina?2:1,o=this.getTileSize();r.width=o.x*a,r.height=o.y*a,this.wmsParams=r},onAdd:function(e){this._crs=this.options.crs||e.options.crs,this._wmsVersion=parseFloat(this.wmsParams.version);var t=this._wmsVersion>=1.3?`crs`:`srs`;this.wmsParams[t]=this._crs.code,Vr.prototype.onAdd.call(this,e)},getTileUrl:function(e){var t=this._tileCoordsToNwSe(e),n=this._crs,r=k(n.project(t[0]),n.project(t[1])),i=r.min,a=r.max,o=(this._wmsVersion>=1.3&&this._crs===Yn?[i.y,i.x,a.y,a.x]:[i.x,i.y,a.x,a.y]).join(`,`),s=Vr.prototype.getTileUrl.call(this,e);return s+m(this.wmsParams,s,this.options.uppercase)+(this.options.uppercase?`&BBOX=`:`&bbox=`)+o},setParams:function(e,t){return n(this.wmsParams,e),t||this.redraw(),this}});function Wr(e,t){return new Ur(e,t)}Vr.WMS=Ur,Hr.wms=Wr;var Gr=Zn.extend({options:{padding:.1},initialize:function(e){p(this,e),o(this),this._layers=this._layers||{}},onAdd:function(){this._container||(this._initContainer(),V(this._container,`leaflet-zoom-animated`)),this.getPane().appendChild(this._container),this._update(),this.on(`update`,this._updatePaths,this)},onRemove:function(){this.off(`update`,this._updatePaths,this),this._destroyContainer()},getEvents:function(){var e={viewreset:this._reset,zoom:this._onZoom,moveend:this._update,zoomend:this._onZoomEnd};return this._zoomAnimated&&(e.zoomanim=this._onAnimZoom),e},_onAnimZoom:function(e){this._updateTransform(e.center,e.zoom)},_onZoom:function(){this._updateTransform(this._map.getCenter(),this._map.getZoom())},_updateTransform:function(e,t){var n=this._map.getZoomScale(t,this._zoom),r=this._map.getSize().multiplyBy(.5+this.options.padding),i=this._map.project(this._center,t),a=r.multiplyBy(-n).add(i).subtract(this._map._getNewPixelOrigin(e,t));R.any3d?Mt(this._container,a,n):U(this._container,a)},_reset:function(){for(var e in this._update(),this._updateTransform(this._center,this._zoom),this._layers)this._layers[e]._reset()},_onZoomEnd:function(){for(var e in this._layers)this._layers[e]._project()},_updatePaths:function(){for(var e in this._layers)this._layers[e]._update()},_update:function(){var e=this.options.padding,t=this._map.getSize(),n=this._map.containerPointToLayerPoint(t.multiplyBy(-e)).round();this._bounds=new O(n,n.add(t.multiplyBy(1+e*2)).round()),this._center=this._map.getCenter(),this._zoom=this._map.getZoom()}}),Kr=Gr.extend({options:{tolerance:0},getEvents:function(){var e=Gr.prototype.getEvents.call(this);return e.viewprereset=this._onViewPreReset,e},_onViewPreReset:function(){this._postponeUpdatePaths=!0},onAdd:function(){Gr.prototype.onAdd.call(this),this._draw()},_initContainer:function(){var e=this._container=document.createElement(`canvas`);W(e,`mousemove`,this._onMouseMove,this),W(e,`click dblclick mousedown mouseup contextmenu`,this._onClick,this),W(e,`mouseout`,this._handleMouseOut,this),e._leaflet_disable_events=!0,this._ctx=e.getContext(`2d`)},_destroyContainer:function(){S(this._redrawRequest),delete this._ctx,B(this._container),G(this._container),delete this._container},_updatePaths:function(){if(!this._postponeUpdatePaths){var e;for(var t in this._redrawBounds=null,this._layers)e=this._layers[t],e._update();this._redraw()}},_update:function(){if(!(this._map._animatingZoom&&this._bounds)){Gr.prototype._update.call(this);var e=this._bounds,t=this._container,n=e.getSize(),r=R.retina?2:1;U(t,e.min),t.width=r*n.x,t.height=r*n.y,t.style.width=n.x+`px`,t.style.height=n.y+`px`,R.retina&&this._ctx.scale(2,2),this._ctx.translate(-e.min.x,-e.min.y),this.fire(`update`)}},_reset:function(){Gr.prototype._reset.call(this),this._postponeUpdatePaths&&(this._postponeUpdatePaths=!1,this._updatePaths())},_initPath:function(e){this._updateDashArray(e),this._layers[o(e)]=e;var t=e._order={layer:e,prev:this._drawLast,next:null};this._drawLast&&(this._drawLast.next=t),this._drawLast=t,this._drawFirst=this._drawFirst||this._drawLast},_addPath:function(e){this._requestRedraw(e)},_removePath:function(e){var t=e._order,n=t.next,r=t.prev;n?n.prev=r:this._drawLast=r,r?r.next=n:this._drawFirst=n,delete e._order,delete this._layers[o(e)],this._requestRedraw(e)},_updatePath:function(e){this._extendRedrawBounds(e),e._project(),e._update(),this._requestRedraw(e)},_updateStyle:function(e){this._updateDashArray(e),this._requestRedraw(e)},_updateDashArray:function(e){if(typeof e.options.dashArray==`string`){var t=e.options.dashArray.split(/[, ]+/),n=[],r,i;for(i=0;i<t.length;i++){if(r=Number(t[i]),isNaN(r))return;n.push(r)}e.options._dashArray=n}else e.options._dashArray=e.options.dashArray},_requestRedraw:function(e){this._map&&(this._extendRedrawBounds(e),this._redrawRequest=this._redrawRequest||x(this._redraw,this))},_extendRedrawBounds:function(e){if(e._pxBounds){var t=(e.options.weight||0)+1;this._redrawBounds=this._redrawBounds||new O,this._redrawBounds.extend(e._pxBounds.min.subtract([t,t])),this._redrawBounds.extend(e._pxBounds.max.add([t,t]))}},_redraw:function(){this._redrawRequest=null,this._redrawBounds&&(this._redrawBounds.min._floor(),this._redrawBounds.max._ceil()),this._clear(),this._draw(),this._redrawBounds=null},_clear:function(){var e=this._redrawBounds;if(e){var t=e.getSize();this._ctx.clearRect(e.min.x,e.min.y,t.x,t.y)}else this._ctx.save(),this._ctx.setTransform(1,0,0,1,0,0),this._ctx.clearRect(0,0,this._container.width,this._container.height),this._ctx.restore()},_draw:function(){var e,t=this._redrawBounds;if(this._ctx.save(),t){var n=t.getSize();this._ctx.beginPath(),this._ctx.rect(t.min.x,t.min.y,n.x,n.y),this._ctx.clip()}this._drawing=!0;for(var r=this._drawFirst;r;r=r.next)e=r.layer,(!t||e._pxBounds&&e._pxBounds.intersects(t))&&e._updatePath();this._drawing=!1,this._ctx.restore()},_updatePoly:function(e,t){if(this._drawing){var n,r,i,a,o=e._parts,s=o.length,c=this._ctx;if(s){for(c.beginPath(),n=0;n<s;n++){for(r=0,i=o[n].length;r<i;r++)a=o[n][r],c[r?`lineTo`:`moveTo`](a.x,a.y);t&&c.closePath()}this._fillStroke(c,e)}}},_updateCircle:function(e){if(!(!this._drawing||e._empty())){var t=e._point,n=this._ctx,r=Math.max(Math.round(e._radius),1),i=(Math.max(Math.round(e._radiusY),1)||r)/r;i!==1&&(n.save(),n.scale(1,i)),n.beginPath(),n.arc(t.x,t.y/i,r,0,Math.PI*2,!1),i!==1&&n.restore(),this._fillStroke(n,e)}},_fillStroke:function(e,t){var n=t.options;n.fill&&(e.globalAlpha=n.fillOpacity,e.fillStyle=n.fillColor||n.color,e.fill(n.fillRule||`evenodd`)),n.stroke&&n.weight!==0&&(e.setLineDash&&e.setLineDash(t.options&&t.options._dashArray||[]),e.globalAlpha=n.opacity,e.lineWidth=n.weight,e.strokeStyle=n.color,e.lineCap=n.lineCap,e.lineJoin=n.lineJoin,e.stroke())},_onClick:function(e){for(var t=this._map.mouseEventToLayerPoint(e),n,r,i=this._drawFirst;i;i=i.next)n=i.layer,n.options.interactive&&n._containsPoint(t)&&(!(e.type===`click`||e.type===`preclick`)||!this._map._draggableMoved(n))&&(r=n);this._fireEvent(r?[r]:!1,e)},_onMouseMove:function(e){if(!(!this._map||this._map.dragging.moving()||this._map._animatingZoom)){var t=this._map.mouseEventToLayerPoint(e);this._handleMouseHover(e,t)}},_handleMouseOut:function(e){var t=this._hoveredLayer;t&&(H(this._container,`leaflet-interactive`),this._fireEvent([t],e,`mouseout`),this._hoveredLayer=null,this._mouseHoverThrottled=!1)},_handleMouseHover:function(e,t){if(!this._mouseHoverThrottled){for(var n,r,a=this._drawFirst;a;a=a.next)n=a.layer,n.options.interactive&&n._containsPoint(t)&&(r=n);r!==this._hoveredLayer&&(this._handleMouseOut(e),r&&(V(this._container,`leaflet-interactive`),this._fireEvent([r],e,`mouseover`),this._hoveredLayer=r)),this._fireEvent(this._hoveredLayer?[this._hoveredLayer]:!1,e),this._mouseHoverThrottled=!0,setTimeout(i(function(){this._mouseHoverThrottled=!1},this),32)}},_fireEvent:function(e,t,n){this._map._fireDOMEvent(t,n||t.type,e)},_bringToFront:function(e){var t=e._order;if(t){var n=t.next,r=t.prev;if(n)n.prev=r;else return;r?r.next=n:n&&(this._drawFirst=n),t.prev=this._drawLast,this._drawLast.next=t,t.next=null,this._drawLast=t,this._requestRedraw(e)}},_bringToBack:function(e){var t=e._order;if(t){var n=t.next,r=t.prev;if(r)r.next=n;else return;n?n.prev=r:r&&(this._drawLast=r),t.prev=null,t.next=this._drawFirst,this._drawFirst.prev=t,this._drawFirst=t,this._requestRedraw(e)}}});function qr(e){return R.canvas?new Kr(e):null}var Jr=(function(){try{return document.namespaces.add(`lvml`,`urn:schemas-microsoft-com:vml`),function(e){return document.createElement(`<lvml:`+e+` class="lvml">`)}}catch{}return function(e){return document.createElement(`<`+e+` xmlns="urn:schemas-microsoft.com:vml" class="lvml">`)}})(),Yr={_initContainer:function(){this._container=z(`div`,`leaflet-vml-container`)},_update:function(){this._map._animatingZoom||(Gr.prototype._update.call(this),this.fire(`update`))},_initPath:function(e){var t=e._container=Jr(`shape`);V(t,`leaflet-vml-shape `+(this.options.className||``)),t.coordsize=`1 1`,e._path=Jr(`path`),t.appendChild(e._path),this._updateStyle(e),this._layers[o(e)]=e},_addPath:function(e){var t=e._container;this._container.appendChild(t),e.options.interactive&&e.addInteractiveTarget(t)},_removePath:function(e){var t=e._container;B(t),e.removeInteractiveTarget(t),delete this._layers[o(e)]},_updateStyle:function(e){var t=e._stroke,n=e._fill,r=e.options,i=e._container;i.stroked=!!r.stroke,i.filled=!!r.fill,r.stroke?(t||=e._stroke=Jr(`stroke`),i.appendChild(t),t.weight=r.weight+`px`,t.color=r.color,t.opacity=r.opacity,r.dashArray?t.dashStyle=_(r.dashArray)?r.dashArray.join(` `):r.dashArray.replace(/( *, *)/g,` `):t.dashStyle=``,t.endcap=r.lineCap.replace(`butt`,`flat`),t.joinstyle=r.lineJoin):t&&(i.removeChild(t),e._stroke=null),r.fill?(n||=e._fill=Jr(`fill`),i.appendChild(n),n.color=r.fillColor||r.color,n.opacity=r.fillOpacity):n&&(i.removeChild(n),e._fill=null)},_updateCircle:function(e){var t=e._point.round(),n=Math.round(e._radius),r=Math.round(e._radiusY||n);this._setPath(e,e._empty()?`M0 0`:`AL `+t.x+`,`+t.y+` `+n+`,`+r+` 0,23592600`)},_setPath:function(e,t){e._path.v=t},_bringToFront:function(e){wt(e._container)},_bringToBack:function(e){Tt(e._container)}},Xr=R.vml?Jr:me,Zr=Gr.extend({_initContainer:function(){this._container=Xr(`svg`),this._container.setAttribute(`pointer-events`,`none`),this._rootGroup=Xr(`g`),this._container.appendChild(this._rootGroup)},_destroyContainer:function(){B(this._container),G(this._container),delete this._container,delete this._rootGroup,delete this._svgSize},_update:function(){if(!(this._map._animatingZoom&&this._bounds)){Gr.prototype._update.call(this);var e=this._bounds,t=e.getSize(),n=this._container;(!this._svgSize||!this._svgSize.equals(t))&&(this._svgSize=t,n.setAttribute(`width`,t.x),n.setAttribute(`height`,t.y)),U(n,e.min),n.setAttribute(`viewBox`,[e.min.x,e.min.y,t.x,t.y].join(` `)),this.fire(`update`)}},_initPath:function(e){var t=e._path=Xr(`path`);e.options.className&&V(t,e.options.className),e.options.interactive&&V(t,`leaflet-interactive`),this._updateStyle(e),this._layers[o(e)]=e},_addPath:function(e){this._rootGroup||this._initContainer(),this._rootGroup.appendChild(e._path),e.addInteractiveTarget(e._path)},_removePath:function(e){B(e._path),e.removeInteractiveTarget(e._path),delete this._layers[o(e)]},_updatePath:function(e){e._project(),e._update()},_updateStyle:function(e){var t=e._path,n=e.options;t&&(n.stroke?(t.setAttribute(`stroke`,n.color),t.setAttribute(`stroke-opacity`,n.opacity),t.setAttribute(`stroke-width`,n.weight),t.setAttribute(`stroke-linecap`,n.lineCap),t.setAttribute(`stroke-linejoin`,n.lineJoin),n.dashArray?t.setAttribute(`stroke-dasharray`,n.dashArray):t.removeAttribute(`stroke-dasharray`),n.dashOffset?t.setAttribute(`stroke-dashoffset`,n.dashOffset):t.removeAttribute(`stroke-dashoffset`)):t.setAttribute(`stroke`,`none`),n.fill?(t.setAttribute(`fill`,n.fillColor||n.color),t.setAttribute(`fill-opacity`,n.fillOpacity),t.setAttribute(`fill-rule`,n.fillRule||`evenodd`)):t.setAttribute(`fill`,`none`))},_updatePoly:function(e,t){this._setPath(e,he(e._parts,t))},_updateCircle:function(e){var t=e._point,n=Math.max(Math.round(e._radius),1),r=Math.max(Math.round(e._radiusY),1)||n,i=`a`+n+`,`+r+` 0 1,0 `,a=e._empty()?`M0 0`:`M`+(t.x-n)+`,`+t.y+i+n*2+`,0 `+i+-n*2+`,0 `;this._setPath(e,a)},_setPath:function(e,t){e._path.setAttribute(`d`,t)},_bringToFront:function(e){wt(e._path)},_bringToBack:function(e){Tt(e._path)}});R.vml&&Zr.include(Yr);function Qr(e){return R.svg||R.vml?new Zr(e):null}K.include({getRenderer:function(e){var t=e.options.renderer||this._getPaneRenderer(e.options.pane)||this.options.renderer||this._renderer;return t||=this._renderer=this._createRenderer(),this.hasLayer(t)||this.addLayer(t),t},_getPaneRenderer:function(e){if(e===`overlayPane`||e===void 0)return!1;var t=this._paneRenderers[e];return t===void 0&&(t=this._createRenderer({pane:e}),this._paneRenderers[e]=t),t},_createRenderer:function(e){return this.options.preferCanvas&&qr(e)||Qr(e)}});var $r=pr.extend({initialize:function(e,t){pr.prototype.initialize.call(this,this._boundsToLatLngs(e),t)},setBounds:function(e){return this.setLatLngs(this._boundsToLatLngs(e))},_boundsToLatLngs:function(e){return e=j(e),[e.getSouthWest(),e.getNorthWest(),e.getNorthEast(),e.getSouthEast()]}});function ei(e,t){return new $r(e,t)}Zr.create=Xr,Zr.pointsToPath=he,hr.geometryToLayer=gr,hr.coordsToLatLng=vr,hr.coordsToLatLngs=yr,hr.latLngToCoords=br,hr.latLngsToCoords=xr,hr.getFeature=Sr,hr.asFeature=Cr,K.mergeOptions({boxZoom:!0});var ti=xn.extend({initialize:function(e){this._map=e,this._container=e._container,this._pane=e._panes.overlayPane,this._resetStateTimeout=0,e.on(`unload`,this._destroy,this)},addHooks:function(){W(this._container,`mousedown`,this._onMouseDown,this)},removeHooks:function(){G(this._container,`mousedown`,this._onMouseDown,this)},moved:function(){return this._moved},_destroy:function(){B(this._pane),delete this._pane},_resetState:function(){this._resetStateTimeout=0,this._moved=!1},_clearDeferredResetState:function(){this._resetStateTimeout!==0&&(clearTimeout(this._resetStateTimeout),this._resetStateTimeout=0)},_onMouseDown:function(e){if(!e.shiftKey||e.which!==1&&e.button!==1)return!1;this._clearDeferredResetState(),this._resetState(),Pt(),Rt(),this._startPoint=this._map.mouseEventToContainerPoint(e),W(document,{contextmenu:nn,mousemove:this._onMouseMove,mouseup:this._onMouseUp,keydown:this._onKeyDown},this)},_onMouseMove:function(e){this._moved||(this._moved=!0,this._box=z(`div`,`leaflet-zoom-box`,this._container),V(this._container,`leaflet-crosshair`),this._map.fire(`boxzoomstart`)),this._point=this._map.mouseEventToContainerPoint(e);var t=new O(this._point,this._startPoint),n=t.getSize();U(this._box,t.min),this._box.style.width=n.x+`px`,this._box.style.height=n.y+`px`},_finish:function(){this._moved&&(B(this._box),H(this._container,`leaflet-crosshair`)),Ft(),zt(),G(document,{contextmenu:nn,mousemove:this._onMouseMove,mouseup:this._onMouseUp,keydown:this._onKeyDown},this)},_onMouseUp:function(e){if(!(e.which!==1&&e.button!==1)&&(this._finish(),this._moved)){this._clearDeferredResetState(),this._resetStateTimeout=setTimeout(i(this._resetState,this),0);var t=new A(this._map.containerPointToLatLng(this._startPoint),this._map.containerPointToLatLng(this._point));this._map.fitBounds(t).fire(`boxzoomend`,{boxZoomBounds:t})}},_onKeyDown:function(e){e.keyCode===27&&(this._finish(),this._clearDeferredResetState(),this._resetState())}});K.addInitHook(`addHandler`,`boxZoom`,ti),K.mergeOptions({doubleClickZoom:!0});var X=xn.extend({addHooks:function(){this._map.on(`dblclick`,this._onDoubleClick,this)},removeHooks:function(){this._map.off(`dblclick`,this._onDoubleClick,this)},_onDoubleClick:function(e){var t=this._map,n=t.getZoom(),r=t.options.zoomDelta,i=e.originalEvent.shiftKey?n-r:n+r;t.options.doubleClickZoom===`center`?t.setZoom(i):t.setZoomAround(e.containerPoint,i)}});K.addInitHook(`addHandler`,`doubleClickZoom`,X),K.mergeOptions({dragging:!0,inertia:!0,inertiaDeceleration:3400,inertiaMaxSpeed:1/0,easeLinearity:.2,worldCopyJump:!1,maxBoundsViscosity:0});var ni=xn.extend({addHooks:function(){if(!this._draggable){var e=this._map;this._draggable=new wn(e._mapPane,e._container),this._draggable.on({dragstart:this._onDragStart,drag:this._onDrag,dragend:this._onDragEnd},this),this._draggable.on(`predrag`,this._onPreDragLimit,this),e.options.worldCopyJump&&(this._draggable.on(`predrag`,this._onPreDragWrap,this),e.on(`zoomend`,this._onZoomEnd,this),e.whenReady(this._onZoomEnd,this))}V(this._map._container,`leaflet-grab leaflet-touch-drag`),this._draggable.enable(),this._positions=[],this._times=[]},removeHooks:function(){H(this._map._container,`leaflet-grab`),H(this._map._container,`leaflet-touch-drag`),this._draggable.disable()},moved:function(){return this._draggable&&this._draggable._moved},moving:function(){return this._draggable&&this._draggable._moving},_onDragStart:function(){var e=this._map;if(e._stop(),this._map.options.maxBounds&&this._map.options.maxBoundsViscosity){var t=j(this._map.options.maxBounds);this._offsetLimit=k(this._map.latLngToContainerPoint(t.getNorthWest()).multiplyBy(-1),this._map.latLngToContainerPoint(t.getSouthEast()).multiplyBy(-1).add(this._map.getSize())),this._viscosity=Math.min(1,Math.max(0,this._map.options.maxBoundsViscosity))}else this._offsetLimit=null;e.fire(`movestart`).fire(`dragstart`),e.options.inertia&&(this._positions=[],this._times=[])},_onDrag:function(e){if(this._map.options.inertia){var t=this._lastTime=+new Date,n=this._lastPos=this._draggable._absPos||this._draggable._newPos;this._positions.push(n),this._times.push(t),this._prunePositions(t)}this._map.fire(`move`,e).fire(`drag`,e)},_prunePositions:function(e){for(;this._positions.length>1&&e-this._times[0]>50;)this._positions.shift(),this._times.shift()},_onZoomEnd:function(){var e=this._map.getSize().divideBy(2),t=this._map.latLngToLayerPoint([0,0]);this._initialWorldOffset=t.subtract(e).x,this._worldWidth=this._map.getPixelWorldBounds().getSize().x},_viscousLimit:function(e,t){return e-(e-t)*this._viscosity},_onPreDragLimit:function(){if(!(!this._viscosity||!this._offsetLimit)){var e=this._draggable._newPos.subtract(this._draggable._startPos),t=this._offsetLimit;e.x<t.min.x&&(e.x=this._viscousLimit(e.x,t.min.x)),e.y<t.min.y&&(e.y=this._viscousLimit(e.y,t.min.y)),e.x>t.max.x&&(e.x=this._viscousLimit(e.x,t.max.x)),e.y>t.max.y&&(e.y=this._viscousLimit(e.y,t.max.y)),this._draggable._newPos=this._draggable._startPos.add(e)}},_onPreDragWrap:function(){var e=this._worldWidth,t=Math.round(e/2),n=this._initialWorldOffset,r=this._draggable._newPos.x,i=(r-t+n)%e+t-n,a=(r+t+n)%e-t-n,o=Math.abs(i+n)<Math.abs(a+n)?i:a;this._draggable._absPos=this._draggable._newPos.clone(),this._draggable._newPos.x=o},_onDragEnd:function(e){var t=this._map,n=t.options,r=!n.inertia||e.noInertia||this._times.length<2;if(t.fire(`dragend`,e),r)t.fire(`moveend`);else{this._prunePositions(+new Date);var i=this._lastPos.subtract(this._positions[0]),a=(this._lastTime-this._times[0])/1e3,o=n.easeLinearity,s=i.multiplyBy(o/a),c=s.distanceTo([0,0]),l=Math.min(n.inertiaMaxSpeed,c),u=s.multiplyBy(l/c),d=l/(n.inertiaDeceleration*o),f=u.multiplyBy(-d/2).round();!f.x&&!f.y?t.fire(`moveend`):(f=t._limitOffset(f,t.options.maxBounds),x(function(){t.panBy(f,{duration:d,easeLinearity:o,noMoveStart:!0,animate:!0})}))}}});K.addInitHook(`addHandler`,`dragging`,ni),K.mergeOptions({keyboard:!0,keyboardPanDelta:80});var ri=xn.extend({keyCodes:{left:[37],right:[39],down:[40],up:[38],zoomIn:[187,107,61,171],zoomOut:[189,109,54,173]},initialize:function(e){this._map=e,this._setPanDelta(e.options.keyboardPanDelta),this._setZoomDelta(e.options.zoomDelta)},addHooks:function(){var e=this._map._container;e.tabIndex<=0&&(e.tabIndex=`0`),W(e,{focus:this._onFocus,blur:this._onBlur,mousedown:this._onMouseDown},this),this._map.on({focus:this._addHooks,blur:this._removeHooks},this)},removeHooks:function(){this._removeHooks(),G(this._map._container,{focus:this._onFocus,blur:this._onBlur,mousedown:this._onMouseDown},this),this._map.off({focus:this._addHooks,blur:this._removeHooks},this)},_onMouseDown:function(){if(!this._focused){var e=document.body,t=document.documentElement,n=e.scrollTop||t.scrollTop,r=e.scrollLeft||t.scrollLeft;this._map._container.focus(),window.scrollTo(r,n)}},_onFocus:function(){this._focused=!0,this._map.fire(`focus`)},_onBlur:function(){this._focused=!1,this._map.fire(`blur`)},_setPanDelta:function(e){var t=this._panKeys={},n=this.keyCodes,r,i;for(r=0,i=n.left.length;r<i;r++)t[n.left[r]]=[-1*e,0];for(r=0,i=n.right.length;r<i;r++)t[n.right[r]]=[e,0];for(r=0,i=n.down.length;r<i;r++)t[n.down[r]]=[0,e];for(r=0,i=n.up.length;r<i;r++)t[n.up[r]]=[0,-1*e]},_setZoomDelta:function(e){var t=this._zoomKeys={},n=this.keyCodes,r,i;for(r=0,i=n.zoomIn.length;r<i;r++)t[n.zoomIn[r]]=e;for(r=0,i=n.zoomOut.length;r<i;r++)t[n.zoomOut[r]]=-e},_addHooks:function(){W(document,`keydown`,this._onKeyDown,this)},_removeHooks:function(){G(document,`keydown`,this._onKeyDown,this)},_onKeyDown:function(e){if(!(e.altKey||e.ctrlKey||e.metaKey)){var t=e.keyCode,n=this._map,r;if(t in this._panKeys){if(!n._panAnim||!n._panAnim._inProgress)if(r=this._panKeys[t],e.shiftKey&&(r=D(r).multiplyBy(3)),n.options.maxBounds&&(r=n._limitOffset(D(r),n.options.maxBounds)),n.options.worldCopyJump){var i=n.wrapLatLng(n.unproject(n.project(n.getCenter()).add(r)));n.panTo(i)}else n.panBy(r)}else if(t in this._zoomKeys)n.setZoom(n.getZoom()+(e.shiftKey?3:1)*this._zoomKeys[t]);else if(t===27&&n._popup&&n._popup.options.closeOnEscapeKey)n.closePopup();else return;nn(e)}}});K.addInitHook(`addHandler`,`keyboard`,ri),K.mergeOptions({scrollWheelZoom:!0,wheelDebounceTime:40,wheelPxPerZoomLevel:60});var ii=xn.extend({addHooks:function(){W(this._map._container,`wheel`,this._onWheelScroll,this),this._delta=0},removeHooks:function(){G(this._map._container,`wheel`,this._onWheelScroll,this)},_onWheelScroll:function(e){var t=sn(e),n=this._map.options.wheelDebounceTime;this._delta+=t,this._lastMousePos=this._map.mouseEventToContainerPoint(e),this._startTime||=+new Date;var r=Math.max(n-(+new Date-this._startTime),0);clearTimeout(this._timer),this._timer=setTimeout(i(this._performZoom,this),r),nn(e)},_performZoom:function(){var e=this._map,t=e.getZoom(),n=this._map.options.zoomSnap||0;e._stop();var r=this._delta/(this._map.options.wheelPxPerZoomLevel*4),i=4*Math.log(2/(1+Math.exp(-Math.abs(r))))/Math.LN2,a=n?Math.ceil(i/n)*n:i,o=e._limitZoom(t+(this._delta>0?a:-a))-t;this._delta=0,this._startTime=null,o&&(e.options.scrollWheelZoom===`center`?e.setZoom(t+o):e.setZoomAround(this._lastMousePos,t+o))}});K.addInitHook(`addHandler`,`scrollWheelZoom`,ii);var ai=600;K.mergeOptions({tapHold:R.touchNative&&R.safari&&R.mobile,tapTolerance:15});var oi=xn.extend({addHooks:function(){W(this._map._container,`touchstart`,this._onDown,this)},removeHooks:function(){G(this._map._container,`touchstart`,this._onDown,this)},_onDown:function(e){if(clearTimeout(this._holdTimeout),e.touches.length===1){var t=e.touches[0];this._startPos=this._newPos=new E(t.clientX,t.clientY),this._holdTimeout=setTimeout(i(function(){this._cancel(),this._isTapValid()&&(W(document,`touchend`,tn),W(document,`touchend touchcancel`,this._cancelClickPrevent),this._simulateEvent(`contextmenu`,t))},this),ai),W(document,`touchend touchcancel contextmenu`,this._cancel,this),W(document,`touchmove`,this._onMove,this)}},_cancelClickPrevent:function e(){G(document,`touchend`,tn),G(document,`touchend touchcancel`,e)},_cancel:function(){clearTimeout(this._holdTimeout),G(document,`touchend touchcancel contextmenu`,this._cancel,this),G(document,`touchmove`,this._onMove,this)},_onMove:function(e){var t=e.touches[0];this._newPos=new E(t.clientX,t.clientY)},_isTapValid:function(){return this._newPos.distanceTo(this._startPos)<=this._map.options.tapTolerance},_simulateEvent:function(e,t){var n=new MouseEvent(e,{bubbles:!0,cancelable:!0,view:window,screenX:t.screenX,screenY:t.screenY,clientX:t.clientX,clientY:t.clientY});n._simulated=!0,t.target.dispatchEvent(n)}});K.addInitHook(`addHandler`,`tapHold`,oi),K.mergeOptions({touchZoom:R.touch,bounceAtZoomLimits:!0});var si=xn.extend({addHooks:function(){V(this._map._container,`leaflet-touch-zoom`),W(this._map._container,`touchstart`,this._onTouchStart,this)},removeHooks:function(){H(this._map._container,`leaflet-touch-zoom`),G(this._map._container,`touchstart`,this._onTouchStart,this)},_onTouchStart:function(e){var t=this._map;if(!(!e.touches||e.touches.length!==2||t._animatingZoom||this._zooming)){var n=t.mouseEventToContainerPoint(e.touches[0]),r=t.mouseEventToContainerPoint(e.touches[1]);this._centerPoint=t.getSize()._divideBy(2),this._startLatLng=t.containerPointToLatLng(this._centerPoint),t.options.touchZoom!==`center`&&(this._pinchStartLatLng=t.containerPointToLatLng(n.add(r)._divideBy(2))),this._startDist=n.distanceTo(r),this._startZoom=t.getZoom(),this._moved=!1,this._zooming=!0,t._stop(),W(document,`touchmove`,this._onTouchMove,this),W(document,`touchend touchcancel`,this._onTouchEnd,this),tn(e)}},_onTouchMove:function(e){if(!(!e.touches||e.touches.length!==2||!this._zooming)){var t=this._map,n=t.mouseEventToContainerPoint(e.touches[0]),r=t.mouseEventToContainerPoint(e.touches[1]),a=n.distanceTo(r)/this._startDist;if(this._zoom=t.getScaleZoom(a,this._startZoom),!t.options.bounceAtZoomLimits&&(this._zoom<t.getMinZoom()&&a<1||this._zoom>t.getMaxZoom()&&a>1)&&(this._zoom=t._limitZoom(this._zoom)),t.options.touchZoom===`center`){if(this._center=this._startLatLng,a===1)return}else{var o=n._add(r)._divideBy(2)._subtract(this._centerPoint);if(a===1&&o.x===0&&o.y===0)return;this._center=t.unproject(t.project(this._pinchStartLatLng,this._zoom).subtract(o),this._zoom)}this._moved||=(t._moveStart(!0,!1),!0),S(this._animRequest);var s=i(t._move,t,this._center,this._zoom,{pinch:!0,round:!1},void 0);this._animRequest=x(s,this,!0),tn(e)}},_onTouchEnd:function(){if(!this._moved||!this._zooming){this._zooming=!1;return}this._zooming=!1,S(this._animRequest),G(document,`touchmove`,this._onTouchMove,this),G(document,`touchend touchcancel`,this._onTouchEnd,this),this._map.options.zoomAnimation?this._map._animateZoom(this._center,this._map._limitZoom(this._zoom),!0,this._map.options.zoomSnap):this._map._resetView(this._center,this._map._limitZoom(this._zoom))}});K.addInitHook(`addHandler`,`touchZoom`,si),K.BoxZoom=ti,K.DoubleClickZoom=X,K.Drag=ni,K.Keyboard=ri,K.ScrollWheelZoom=ii,K.TapHold=oi,K.TouchZoom=si,e.Bounds=O,e.Browser=R,e.CRS=se,e.Canvas=Kr,e.Circle=q,e.CircleMarker=lr,e.Class=C,e.Control=fn,e.DivIcon=Lr,e.DivOverlay=Mr,e.DomEvent=ln,e.DomUtil=Kt,e.Draggable=wn,e.Evented=T,e.FeatureGroup=er,e.GeoJSON=hr,e.GridLayer=zr,e.Handler=xn,e.Icon=nr,e.ImageOverlay=Dr,e.LatLng=M,e.LatLngBounds=A,e.Layer=Zn,e.LayerGroup=Qn,e.LineUtil=Wn,e.Map=K,e.Marker=or,e.Mixin=Sn,e.Path=cr,e.Point=E,e.PolyUtil=On,e.Polygon=pr,e.Polyline=J,e.Popup=Nr,e.PosAnimation=un,e.Projection=qn,e.Rectangle=$r,e.Renderer=Gr,e.SVG=Zr,e.SVGOverlay=Ar,e.TileLayer=Vr,e.Tooltip=Fr,e.Transformation=ue,e.Util=ie,e.VideoOverlay=Y,e.bind=i,e.bounds=k,e.canvas=qr,e.circle=dr,e.circleMarker=ur,e.control=pn,e.divIcon=Rr,e.extend=n,e.featureGroup=tr,e.geoJSON=Tr,e.geoJson=Er,e.gridLayer=Br,e.icon=rr,e.imageOverlay=Or,e.latLng=N,e.latLngBounds=j,e.layerGroup=$n,e.map=dn,e.marker=sr,e.point=D,e.polygon=mr,e.polyline=fr,e.popup=Pr,e.rectangle=ei,e.setOptions=p,e.stamp=o,e.svg=Qr,e.svgOverlay=jr,e.tileLayer=Hr,e.tooltip=Ir,e.transformation=de,e.version=t,e.videoOverlay=kr;var ci=window.L;e.noConflict=function(){return window.L=ci,this},window.L=e}))})),p=l(f(),1),m=new Set([`0`,`false`,`off`,`no`]);function h(e,t=!0){return e==null||e===``?t:!m.has(String(e).trim().toLowerCase())}function g(e,t=`enhanced`){let n=String(e??``).trim().toLowerCase();return n===`enhanced`||n===`compatibility`?n:n===``?t===`compatibility`?`compatibility`:`enhanced`:h(n)?`enhanced`:`compatibility`}var _={key:`de27deab99d785fc6d1cf5ea64200794`,securityJsCode:`4d0564f442a8150fd4209442f4e2fcde`,plugins:[`AMap.AutoComplete`,`AMap.PlaceSearch`,`AMap.Geolocation`,`AMap.Driving`,`AMap.Geocoder`]},ee={center:[23.129112,113.264385],zoom:16},te=`/api/v1/tiles/relay`,v=g(void 0),ne={profile:v,enhancedGesturesEnabled:v===`enhanced`},re={enabled:!0,provider:`arcgis-terrain3d`,ionToken:``,selfHostedUrl:``,mapTilerUrl:``,exaggeration:1.18,quality:`auto`,demoView:{lng:86.925,lat:27.988,range:32e3,heading:28,pitch:-28}},y=Math.PI,b=6378245,x=.006693421622965943;function S(e,t){return e<72.004||e>137.8347||t<.8293||t>55.8271}function ie(e,t){let n=-100+2*e+3*t+.2*t*t+.1*e*t+.2*Math.sqrt(Math.abs(e));return n+=(20*Math.sin(6*e*y)+20*Math.sin(2*e*y))*2/3,n+=(20*Math.sin(t*y)+40*Math.sin(t/3*y))*2/3,n+=(160*Math.sin(t/12*y)+320*Math.sin(t*y/30))*2/3,n}function C(e,t){let n=300+e+2*t+.1*e*e+.1*e*t+.1*Math.sqrt(Math.abs(e));return n+=(20*Math.sin(6*e*y)+20*Math.sin(2*e*y))*2/3,n+=(20*Math.sin(e*y)+40*Math.sin(e/3*y))*2/3,n+=(150*Math.sin(e/12*y)+300*Math.sin(e/30*y))*2/3,n}function ae(e){let t=Number(e);if(!Number.isFinite(t))return e;let n=((t+180)%360+360)%360-180;return n===-180&&t>0?180:n}function w([e,t]){if(S(e,t))return[e,t];let n=ie(e-105,t-35),r=C(e-105,t-35),i=t/180*y,a=Math.sin(i);a=1-x*a*a;let o=Math.sqrt(a);return n=n*180/(b*(1-x)/(a*o)*y),r=r*180/(b/o*Math.cos(i)*y),[e+r,t+n]}function T([e,t]){if(S(e,t))return[e,t];let n=e-.02,r=e+.02,i=t-.02,a=t+.02,o=e,s=t;for(let c=0;c<30;c++){o=(n+r)/2,s=(i+a)/2;let[c,l]=w([o,s]),u=c-e,d=l-t;if(Math.abs(u)<1e-9&&Math.abs(d)<1e-9)return[o,s];u>0?r=o:n=o,d>0?a=s:i=s}return[o,s]}function E(e){return Array.isArray(e)?typeof e[0]==`number`&&typeof e[1]==`number`?w(e):e.map(E):e}var oe={enableHighAccuracy:!0,timeout:12e3,maximumAge:0},D=oe.timeout+1e3;function O(e){return e?.Geolocation?new e.Geolocation({enableHighAccuracy:!0,noIpLocate:3,timeout:12e3,maximumAge:0,convert:!0,showButton:!1,showMarker:!1,showCircle:!1,panToLocation:!1,zoomToAccuracy:!1}):(console.warn(`高德定位插件加载失败，将仅使用浏览器定位`),null)}function k(e){if(e==null||e===``||typeof e==`boolean`)return null;let t=Number(e);return Number.isFinite(t)?t:null}function A(e){let t=k(e?.lat),n=k(e?.lng);return t!==null&&n!==null&&Math.abs(t)<=90&&Math.abs(n)<=180}function j(e){return e<0?e+360:e}function M(e){let t=Number(e.lat),n=Number(e.lng);if(e.coordType===`gcj02`)return{lat:t,lng:n,accuracy:e.accuracy,source:e.source,coordType:`gcj02`,locationType:e.locationType};let[r,i]=w([n,t]);return{lat:i,lng:r,accuracy:e.accuracy,source:e.source,coordType:`gcj02`,locationType:e.locationType}}function N(e){let t=M(e);return[t.lat,j(t.lng)]}function se(e,t,n,r){let i=Error(e);return t!=null&&(i.code=t),n&&(i.source=n),r!==void 0&&(i.cause=r),i}function P(e){if(e?.reason instanceof Error)return e.reason;let t=typeof DOMException==`function`?new DOMException(`定位请求已取消`,`AbortError`):se(`定位请求已取消`,`ABORT_ERR`);if(e?.reason!==void 0&&!(`cause`in t))try{t.cause=e.reason}catch{}return t}function ce(e,t){return se(`${e===`amap`?`高德`:`浏览器`}定位等待超时（超过 ${t} 毫秒）`,`GEOLOCATION_TIMEOUT`,e)}function le(e,t){let n=k((t===`amap`?e?.amapDeadlineMs:e?.browserDeadlineMs)??e?.deadlineMs);return n!==null&&n>=0?n:D}function ue(e,t,n){let r=le(t,n),i=t?.signal,a=t?.setTimeoutFn||globalThis.setTimeout,o=t?.clearTimeoutFn||globalThis.clearTimeout;return new Promise((t,s)=>{let c=!1,l=null,u=()=>{l!==null&&(o(l),l=null),i?.removeEventListener?.(`abort`,f)},d=(e,t)=>{c||(c=!0,u(),e(t))},f=()=>{d(s,P(i))};if(i?.aborted){f();return}i?.addEventListener?.(`abort`,f,{once:!0}),l=a(()=>{d(s,ce(n,r))},r);try{e(e=>d(t,e),e=>d(s,e),()=>!c)}catch(e){d(s,e)}})}function de(e){return k(typeof e==`function`?e():Date.now())??Date.now()}function fe(e){let t=k(e);return t!==null&&t>=0?t:null}function pe(e,t=Date.now){let n=e?.coords,r={lat:k(n?.latitude),lng:k(n?.longitude),accuracy:fe(n?.accuracy),source:`browser`,coordType:`wgs84`,locationType:`html5`,timestamp:k(e?.timestamp)??de(t)};return A(r)?r:null}function me(e){return Object.prototype.hasOwnProperty.call(e||{},`navigator`)?e.navigator:globalThis.navigator}function he(e={}){let t=e.browserOptions||e.positionOptions||{},n={};for(let t of[`enableHighAccuracy`,`timeout`,`maximumAge`])e[t]!==void 0&&(n[t]=e[t]);return{...oe,...t,...n}}function ge(e={}){return ue((t,n,r)=>{let i=me(e);if(typeof i?.geolocation?.getCurrentPosition!=`function`){n(se(`你的浏览器不支持当前地理位置信息获取`,`GEOLOCATION_UNSUPPORTED`,`browser`));return}i.geolocation.getCurrentPosition(i=>{if(r())try{let r=pe(i,e.now);if(!r){n(se(`浏览器返回了无效的定位坐标`,`POSITION_INVALID`,`browser`));return}t(r)}catch(e){n(e)}},n,he(e))},e,`browser`)}function _e(e,t={}){return ge(t)}function ve(e,t){if(typeof e==`function`){if(typeof queueMicrotask==`function`){queueMicrotask(()=>e(t));return}Promise.resolve().then(()=>e(t))}}function ye(e,t={}){let n=Object.prototype.hasOwnProperty.call(t,`navigator`)?t.navigator:globalThis.navigator,r=new Map,i=1,a=e=>{let t=r.get(e);if(t){r.delete(e),t.active=!1,t.signal?.removeEventListener?.(`abort`,t.handleAbort);try{t.nativeWatchId!==null&&t.nativeWatchId!==void 0&&n?.geolocation?.clearWatch?.(t.nativeWatchId)}catch(e){console.warn(`停止浏览器持续定位监听失败`,e)}}},o=(e,o,s={})=>{if(typeof e!=`function`)throw TypeError(`持续定位成功回调必须是函数`);let c=n?.geolocation;if(typeof c?.watchPosition!=`function`||s.signal?.aborted)return null;let l=i++,u={active:!0,nativeWatchId:null,signal:s.signal,handleAbort:null};r.set(l,u),u.handleAbort=()=>a(l),u.signal?.addEventListener?.(`abort`,u.handleAbort,{once:!0});try{u.nativeWatchId=c.watchPosition(n=>{if(!(!u.active||s.signal?.aborted))try{let r=pe(n,s.now||t.now);if(!r){o?.(se(`浏览器持续定位返回了无效坐标`,`POSITION_INVALID`,`browser`));return}e(r)}catch(e){o?.(e)}},e=>{!u.active||s.signal?.aborted||o?.(e)},he({...t.positionOptions||{},...s}))}catch(e){throw a(l),e}if(!u.active){try{c.clearWatch?.(u.nativeWatchId)}catch{}return null}return l},s=(r={})=>_e(e,{...t.positionOptions||{},...r,navigator:n,now:r.now||t.now,setTimeoutFn:r.setTimeoutFn||t.setTimeoutFn,clearTimeoutFn:r.clearTimeoutFn||t.clearTimeoutFn}),c=e=>{if(typeof e!=`function`)throw TypeError(`定位权限监听器必须是函数`);let t=!0,r=null,i=null,a=null,o=(n,r)=>{t&&e(n,r)},s=()=>{t&&(t=!1,!(!r||!i)&&(typeof r.removeEventListener==`function`?r.removeEventListener(`change`,i):r.onchange===i&&(r.onchange=a)))},c=n?.permissions;return typeof c?.query==`function`?(Promise.resolve().then(()=>c.query({name:`geolocation`})).then(e=>{t&&(r=e,i=()=>o(r?.state||`unknown`),typeof r?.addEventListener==`function`?r.addEventListener(`change`,i):r&&(a=r.onchange,r.onchange=i),o(r?.state||`unknown`))}).catch(e=>o(`unknown`,e)),s):(ve(()=>o(`unknown`)),s)};return{watchPosition:o,clearWatch:a,pollPosition:s,subscribePermission:c,permissions:{subscribe:c}}}function be(){let e=document.getElementById(`app-dialog-root`);return e||(e=document.createElement(`div`),e.id=`app-dialog-root`,document.body.appendChild(e)),e}function F(e){return String(e??``).replaceAll(`&`,`&amp;`).replaceAll(`<`,`&lt;`).replaceAll(`>`,`&gt;`).replaceAll(`"`,`&quot;`).replaceAll(`'`,`&#39;`)}function xe(e,t,n,r){t(),e.innerHTML=``,e.hidden=!0,n(r)}function Se(e={}){let t=be(),n=e.title||`提示`,r=e.message||``,i=e.confirmText||`确定`,a=e.cancelText||`取消`,o=!!e.showCancel,s=e.checkbox||null;t.hidden=!1,t.innerHTML=`
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
  `;let c=t.querySelector(`.app-dialog`);return t.querySelector(`.app-dialog-primary`)?.focus(),new Promise(e=>{let n=()=>{t.removeEventListener(`click`,i),document.removeEventListener(`keydown`,a)},r=r=>{let i=!!t.querySelector(`[data-dialog-checkbox]`)?.checked;xe(t,n,e,s?{confirmed:r,checked:i}:r)},i=e=>{let t=e.target.closest(`[data-dialog-action]`);t&&(c?.contains(e.target)&&t.classList.contains(`app-dialog-backdrop`)||r(t.dataset.dialogAction===`confirm`))},a=e=>{e.key===`Escape`&&(e.preventDefault(),r(!1))};t.addEventListener(`click`,i),document.addEventListener(`keydown`,a)})}function Ce(e,t={}){return Se({title:t.title||`提示`,message:e,confirmText:t.confirmText||`知道了`})}function we(e,t={}){return Se({title:t.title||`确认操作`,message:e,confirmText:t.confirmText||`确认`,cancelText:t.cancelText||`取消`,showCancel:!0})}function Te(e,t={}){return Se({title:t.title||`确认操作`,message:e,confirmText:t.confirmText||`确认`,cancelText:t.cancelText||`取消`,showCancel:!0,checkbox:{label:t.checkboxLabel||``,checked:!!t.checked}})}function Ee(e={}){let t=be(),n=e.title||`编辑属性`,r=e.fields||[],i=e.values||{},a=e.confirmText||`保存`,o=e.cancelText||`取消`;t.hidden=!1,t.innerHTML=`
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
  `;let s=t.querySelector(`[data-dialog-form]`);return r.forEach(e=>{if(e.type===`textarea`){let t=s.querySelector(`textarea[name="${e.name}"]`);t&&(t.value=i[e.name]||``)}}),t.querySelector(`.app-dialog-primary`)?.focus(),new Promise(n=>{let i=()=>{t.removeEventListener(`click`,o),s?.removeEventListener(`submit`,a),document.removeEventListener(`keydown`,c)},a=e=>{e.preventDefault();let r=new FormData(s),a={};for(let[e,t]of r.entries())a[e]=t;xe(t,i,n,a)},o=a=>{let o=a.target.closest(`[data-dialog-action]`);if(!o||s?.contains(a.target)&&o.classList.contains(`app-dialog-backdrop`))return;let c=o.dataset.dialogAction;c===`cancel`?xe(t,i,n,null):c===`reset`&&(a.preventDefault(),a.stopPropagation(),e.resetValues&&r.forEach(t=>{let n=s.querySelector(`[name="${t.name}"]`);n&&(n.value=String(e.resetValues[t.name]??``))}))},c=e=>{e.key===`Escape`&&(e.preventDefault(),xe(t,i,n,null))};t.addEventListener(`click`,o),s?.addEventListener(`submit`,a),document.addEventListener(`keydown`,c)})}function De(e={}){let t=be(),n=e.title||`提示`,r=e.message||``,i=e.choices||[],a=e.cancelText||`取消`;t.hidden=!1,t.innerHTML=`
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
  `;let o=t.querySelector(`.app-dialog`);return new Promise(e=>{let n=()=>{t.removeEventListener(`click`,r),document.removeEventListener(`keydown`,i)},r=r=>{let i=r.target.closest(`[data-choice-action]`);if(i){xe(t,n,e,i.dataset.choiceAction);return}let a=r.target.closest(`[data-dialog-action]`);if(a&&a.dataset.dialogAction===`cancel`){if(o?.contains(r.target)&&a.classList.contains(`app-dialog-backdrop`))return;xe(t,n,e,`cancel`)}},i=r=>{r.key===`Escape`&&(r.preventDefault(),xe(t,n,e,`cancel`))};t.addEventListener(`click`,r),document.addEventListener(`keydown`,i)})}var Oe=15e3,ke=1e3,Ae=3e4,je=100,Me=45e3,Ne=500,Pe=5*6e4,Fe=2,Ie=3,Le=3e4,Re=6371008.8,ze=Object.freeze({idle:`已停止`,starting:`正在启动定位`,tracking:`持续定位中`,stale:`定位信号已中断`,recovering:`正在恢复定位`,suspended:`定位已暂停，等待页面恢复`,"permission-blocked":`定位权限已被禁止`,unsupported:`当前环境不支持持续定位`});function Be(e){if(e==null||e===``||typeof e==`boolean`)return null;let t=Number(e);return Number.isFinite(t)?t:null}function I(e,t){let n=Be(e);return n!==null&&n>=0?n:t}function Ve(e,t,n){return Be(e?.[t]??e?.coords?.[n])}function He(e){return Be(e?.timestamp??e?.providerTimestamp??e?.receivedAt)}function Ue(e,t){let n=I(e?.accuracy??e?.coords?.accuracy,0);return Math.min(n,t)}function We(e){let t=Ve(e,`lat`,`latitude`),n=Ve(e,`lng`,`longitude`);return t!==null&&n!==null&&Math.abs(t)<=90&&Math.abs(n)<=180}function Ge(e,t){return!e||!t?!1:Ve(e,`lat`,`latitude`)===Ve(t,`lat`,`latitude`)&&Ve(e,`lng`,`longitude`)===Ve(t,`lng`,`longitude`)}function Ke(e,t){let n=Ve(e,`lat`,`latitude`)*Math.PI/180,r=Ve(t,`lat`,`latitude`)*Math.PI/180,i=r-n,a=(Ve(t,`lng`,`longitude`)-Ve(e,`lng`,`longitude`))*Math.PI/180,o=Math.sin(i/2),s=Math.sin(a/2),c=o*o+Math.cos(n)*Math.cos(r)*s*s;return 2*Re*Math.asin(Math.min(1,Math.sqrt(c)))}function qe(e,t,n){let r=He(e),i=He(t),a=I(n.defaultIntervalMs,Oe),o=r!==null&&i!==null?Math.max(0,i-r):a,s=I(n.maxSpeedKmh,Ne)*1e3/3600,c=I(n.baseToleranceMeters,30),l=I(n.maxAccuracyMeters,5e3);return c+s*o/1e3+Ue(e,l)+Ue(t,l)}function Je(e){return e&&typeof e==`object`?{...e}:e}function Ye(e={},t,n={}){let r=e?.lastAccepted??null,i=e?.suspect??null;if(!We(t))return{accepted:!1,reason:`invalid-sample`,distanceMeters:null,allowedDistanceMeters:null,reanchored:!1,suspect:i};let a=Be(t?.accuracy??t?.coords?.accuracy);if(a!==null&&a>50)return{accepted:!1,reason:`poor-accuracy`,distanceMeters:null,allowedDistanceMeters:null,reanchored:!1,suspect:i};if(!r||!We(r))return{accepted:!0,reason:`initial-sample`,distanceMeters:0,allowedDistanceMeters:null,reanchored:!1,suspect:null};let o=Ke(r,t),s=qe(r,t,n),c=He(r),l=He(t),u=I(n.reanchorAfterMs,Pe);if(c!==null&&l!==null&&l-c>=u)return{accepted:!0,reason:`long-gap-reanchor`,distanceMeters:o,allowedDistanceMeters:s,reanchored:!0,suspect:null};if(o<=s)return{accepted:!0,reason:`within-dynamic-threshold`,distanceMeters:o,allowedDistanceMeters:s,reanchored:!1,suspect:null};if(i&&We(i)){let e=He(i),r=Ke(i,t),a=e===null||l===null||l>e||l===e&&r>.5,c=Math.max(I(n.suspectRadiusMeters,150),qe(i,t,n));if(a&&r<=c)return{accepted:!0,reason:`confirmed-reanchor`,distanceMeters:o,allowedDistanceMeters:s,reanchored:!0,suspect:null};if(!a)return{accepted:!1,reason:`duplicate-suspect`,distanceMeters:o,allowedDistanceMeters:s,reanchored:!1,suspect:i}}return{accepted:!1,reason:`suspect-jump`,distanceMeters:o,allowedDistanceMeters:s,reanchored:!1,suspect:Je(t)}}function Xe(e){return ze[typeof e==`string`?e:e?.phase]||`定位状态未知`}function Ze(e,t){let n=typeof t==`string`?t:t?.phase,r=Xe(t);return e?(e.dataset&&(e.dataset.locationPhase=n||`unknown`,e.dataset.locationLabel=r),e.title=r,e.setAttribute?.(`aria-label`,r),r):r}function R(e){let t=typeof e==`string`?e:e?.state;return[`granted`,`prompt`,`denied`].includes(t)?t:`unknown`}function Qe(e,t){let n=Be(e?.code),r=String(e?.code??e?.name??``).toUpperCase(),i=`source-error`;return n===1||r===`GEOLOCATION_PERMISSION_DENIED`||r===`PERMISSION_DENIED`?i=`permission-denied`:n===2||r===`GEOLOCATION_UNAVAILABLE`||r===`POSITION_UNAVAILABLE`?i=`position-unavailable`:n===3||r===`GEOLOCATION_TIMEOUT`||r===`TIMEOUT`?i=`timeout`:(r===`GEOLOCATION_UNSUPPORTED`||r===`GEOLOCATION_WATCH_UNSUPPORTED`)&&(i=`unsupported`),{code:i,message:{"permission-denied":`定位权限已被禁止`,"position-unavailable":`暂时无法获取定位`,timeout:`获取定位超时`,unsupported:`当前环境不支持持续定位`,"source-error":`定位服务暂时异常`}[i],at:t}}function $e(){if(typeof AbortController==`function`)return new AbortController;let e={aborted:!1};return{signal:e,abort(){e.aborted=!0}}}function et(e,t,n){let r=t||e?.[n];return typeof r==`function`?(...n)=>r.apply(t?void 0:e,n):null}function tt(e={}){return{now:typeof e.now==`function`?()=>e.now():()=>Date.now(),setTimeout:typeof e.setTimeout==`function`?(t,n)=>e.setTimeout(t,n):(e,t)=>globalThis.setTimeout(e,t),clearTimeout:typeof e.clearTimeout==`function`?t=>e.clearTimeout(t):e=>globalThis.clearTimeout(e)}}function nt(e){return e?typeof e.isVisible==`function`?e.isVisible()!==!1:typeof e.visibilityState==`function`?e.visibilityState()!==`hidden`:typeof e.visibilityState==`string`?e.visibilityState!==`hidden`:!0:!0}function rt(e,t,n){return typeof e?.addEventListener==`function`?(e.addEventListener(t,n),()=>e.removeEventListener?.(t,n)):typeof e?.on==`function`?(e.on(t,n),()=>e.off?.(t,n)):()=>{}}function it(e={}){let t=e.source||null,n=et(t,e.watchPosition,`watchPosition`),r=et(t,e.clearWatch,`clearWatch`),i=et(t,e.pollPosition,`pollPosition`),a=et(t,e.subscribePermission,`subscribePermission`)||et(t,e.onPermissionChange,`onPermissionChange`),o=et(t,e.getPermissionState,`getPermissionState`),s=e.lifecycle||null,c=tt(e.clock),l=typeof e.onPosition==`function`?e.onPosition:()=>{},u=typeof e.onStateChange==`function`?e.onStateChange:()=>{},d={intervalMs:I(e.intervalMs,Oe),pollIntervalMs:I(e.pollIntervalMs,I(e.intervalMs,Oe)),staleTimeoutMs:I(e.staleTimeoutMs,Math.max(Me,I(e.intervalMs,Oe)*4)),retryBaseMs:I(e.retryBaseMs,ke),retryMaxMs:I(e.retryMaxMs,Ae),lifecycleDebounceMs:I(e.lifecycleDebounceMs,je),watchFailuresBeforePoll:Math.max(1,Math.floor(I(e.watchFailuresBeforePoll,Fe))),timestampNonProgressLimit:Math.max(1,Math.floor(I(e.timestampNonProgressLimit,Ie))),consumerTimeoutMs:I(e.consumerTimeoutMs,Math.max(Le,I(e.intervalMs,Oe)*2)),positionOptions:e.positionOptions},f=e.staleTimeoutMs===void 0,p=e.pollIntervalMs===void 0,m=e.consumerTimeoutMs===void 0,h={desiredActive:!1,phase:`idle`,generation:0,watchId:null,activeSource:null,lastSignalAt:null,lastFixAt:null,lastProviderTimestamp:null,consecutiveTimestampAnomalies:0,consecutiveFailures:0,restartCount:0,lastError:null,permissionState:R(e.permissionState??t?.permissionState)},g=!1,_=!1,ee=null,te=null,v=null,ne=null,re=null,y=null,b=null,x=!1,S=0,ie=null,C=[],ae=null,w=0,T=null,E=0,oe=0,D=null;function O(){return{...h,lastError:h.lastError?{...h.lastError}:null,intervalMs:d.intervalMs,staleTimeoutMs:d.staleTimeoutMs,consumerTimeoutMs:d.consumerTimeoutMs}}function k(){try{u(O())}catch{}}function A(e){let t=e===`watchdog`?ee:e===`recovery`?te:e===`poll`?v:ne;t!==null&&(c.clearTimeout(t),e===`watchdog`?ee=null:e===`recovery`?te=null:e===`poll`?v=null:ne=null)}function j(){let e=h.watchId;if(h.watchId=null,!(e===null||!r))try{r(e)}catch{}}function M(){y?.abort(),y=null,b=null,A(`consume`),re!==null&&(c.clearTimeout(re),re=null),S+=1,x=!1,ie=null}function N(){j(),A(`watchdog`),A(`poll`),h.activeSource=null,T=null,M()}function se(){return h.generation+=1,h.lastProviderTimestamp=null,h.consecutiveTimestampAnomalies=0,oe=0,D=null,N(),h.generation}function P(e){return h.desiredActive&&!g&&e===h.generation}function ce(e){T!==null&&e<T&&(T=e),h.lastSignalAt!==null&&e<h.lastSignalAt&&(h.lastSignalAt=e),ie!==null&&e<ie&&(ie=null)}function le(e){if(A(`watchdog`),!P(e)||h.phase===`suspended`||h.phase===`permission-blocked`)return;let t=c.now();ce(t);let n=h.lastSignalAt!==null&&h.lastSignalAt>=T?h.lastSignalAt:T,r=n===null?0:Math.max(0,t-n),a=Math.max(0,d.staleTimeoutMs-r);ee=c.setTimeout(()=>{if(ee=null,!P(e))return;ce(c.now());let t=h.lastSignalAt!==null&&h.lastSignalAt>=T?h.lastSignalAt:T;if((t===null?d.staleTimeoutMs:Math.max(0,c.now()-t))<d.staleTimeoutMs){le(e);return}h.phase=`stale`,h.lastError={code:`provider-stale`,message:`长时间未收到定位信号`,at:c.now()},k(),h.activeSource===`watch`&&(E+=1,E>=d.watchFailuresBeforePoll&&i&&(_=!0)),be(0)},a)}function ue(){let e=Math.max(0,h.consecutiveFailures-1);return Math.min(d.retryMaxMs,d.retryBaseMs*2**Math.min(e,20))}function de(){h.lastError={code:`consumer-error`,message:`地图位置更新失败，定位将继续`,at:c.now()},k()}function fe(e){if(!P(e)||x||!b)return;let t=c.now();ce(t);let n=ie===null?0:Math.max(0,d.intervalMs-(t-ie));if(n>0){ne===null&&(ne=c.setTimeout(()=>{ne=null,fe(e)},n));return}let r=b;b=null,x=!0,ie=t;let i=++S,a=y?.signal,o=Promise.resolve().then(()=>l(r.position,{generation:e,signal:a,providerTimestamp:r.providerTimestamp}));(d.consumerTimeoutMs>0?Promise.race([o,new Promise((e,t)=>{re=c.setTimeout(()=>{re=null;let e=Error(`地图位置更新等待超时`);e.code=`consumer-timeout`,t(e)},d.consumerTimeoutMs)})]):o).then(t=>{if(!(!P(e)||i!==S||a?.aborted)){if(t===!1){de();return}h.lastFixAt=c.now(),h.lastError=null,k()}}).catch(t=>{P(e)&&i===S&&!a?.aborted&&(t?.code===`consumer-timeout`?(h.consecutiveFailures+=1,h.lastError={code:`consumer-timeout`,message:`地图位置更新超时，正在自动恢复定位`,at:c.now()},k(),be(0)):de())}).finally(()=>{i===S&&(re!==null&&(c.clearTimeout(re),re=null),x=!1,P(e)&&fe(e))})}function pe(e,t){if(!P(t))return;if(!We(e)){he({code:`POSITION_INVALID`},t);return}let n=c.now();ce(n),h.lastSignalAt=n,le(t);let r=He(e),a=r===null?n:r,o=h.lastProviderTimestamp!==null&&a<h.lastProviderTimestamp,s=h.lastProviderTimestamp!==null&&a===h.lastProviderTimestamp&&Ge(e,D);if(o||s){if(h.consecutiveTimestampAnomalies+=1,h.consecutiveTimestampAnomalies>=d.timestampNonProgressLimit){h.activeSource===`watch`&&(E+=1,E>=d.watchFailuresBeforePoll&&i&&(_=!0)),h.consecutiveFailures+=1,h.lastError={code:`provider-timestamp-not-progressing`,message:`定位数据持续未推进，正在自动重建定位源`,at:n},be(0);return}k();return}h.consecutiveTimestampAnomalies=0,h.lastProviderTimestamp=h.lastProviderTimestamp===null?a:Math.max(h.lastProviderTimestamp,a),D=e,oe+=1,h.activeSource===`watch`&&oe>=2&&(E=0),h.consecutiveFailures=0,h.permissionState=`granted`,h.phase=`tracking`,b={position:e,providerTimestamp:a},k(),fe(t)}function me(e){h.permissionState=`denied`,h.consecutiveFailures+=1,h.lastError=e,se(),A(`recovery`),h.phase=`permission-blocked`,k()}function he(e,t){if(!P(t))return;h.lastSignalAt=c.now();let n=Qe(e,c.now());if(n.code===`permission-denied`){me(n);return}if(n.code===`unsupported`){h.lastError=n,se(),A(`recovery`),h.phase=`unsupported`,k();return}h.activeSource===`watch`&&(E+=1,E>=d.watchFailuresBeforePoll&&i&&(_=!0)),h.consecutiveFailures+=1,h.lastError=n,k(),be(ue())}function ge(e){A(`poll`),!(!P(e)||h.activeSource!==`poll`)&&(v=c.setTimeout(()=>{v=null,_e(e)},d.pollIntervalMs))}function _e(e){if(!P(e)||h.activeSource!==`poll`||!i)return;let t;try{t=i({generation:e,signal:y?.signal,now:c.now,setTimeoutFn:c.setTimeout,clearTimeoutFn:c.clearTimeout})}catch(t){he(t,e);return}Promise.resolve(t).then(t=>{P(e)&&pe(t,e)}).catch(t=>{P(e)&&he(t,e)}).finally(()=>{P(e)&&h.activeSource===`poll`&&ge(e)})}function ve(e){return!i||!P(e)?!1:(_=!0,h.watchId=null,h.activeSource=`poll`,le(e),k(),_e(e),!0)}function ye(e,t){if(P(e)&&(A(`recovery`),y=$e(),h.phase=t?`recovering`:`starting`,T=c.now(),h.activeSource=null,t&&(h.restartCount+=1),k(),P(e))){if(n&&!_){let t;try{t=n(t=>{h.activeSource!==`poll`&&pe(t,e)},t=>{h.activeSource!==`poll`&&he(t,e)},{...d.positionOptions||{},signal:y.signal,now:c.now})}catch(t){if(ve(e))return;he(t,e);return}if(!P(e)){if(t!=null&&r)try{r(t)}catch{}return}if(t==null){if(ve(e))return;he({code:`GEOLOCATION_WATCH_UNSUPPORTED`},e);return}h.watchId=t,h.activeSource=`watch`,le(e),k();return}ve(e)||(h.phase=`unsupported`,h.lastError={code:`unsupported`,message:`当前环境不支持持续定位`,at:c.now()},k())}}function be(e){if(!h.desiredActive||g)return;A(`recovery`);let t=se();if(h.phase=`recovering`,k(),e<=0){ye(t,!0);return}te=c.setTimeout(()=>{te=null,ye(t,!0)},e)}function F(){!h.desiredActive||h.phase===`suspended`||(A(`recovery`),se(),h.phase=`suspended`,k())}function xe(){if(!h.desiredActive||g||!nt(s))return;if(h.phase===`permission-blocked`){we(!0);return}let e=c.now();ce(e);let t=h.lastSignalAt===null?1/0:e-h.lastSignalAt;(h.phase===`suspended`||!h.activeSource||t>=d.staleTimeoutMs)&&be(0)}function Se(){if(!h.desiredActive||g||!nt(s)||te!==null)return;let e=h.generation;te=c.setTimeout(()=>{te=null,P(e)&&xe()},d.lifecycleDebounceMs)}function Ce(e,t=!1){if(!h.desiredActive||g)return;let n=R(e);if(h.permissionState=n,n===`denied`){me({code:`permission-denied`,message:`定位权限已被禁止`,at:c.now()});return}k(),(h.phase===`permission-blocked`||!h.activeSource&&h.phase!==`suspended`||t&&n===`unknown`&&h.phase===`permission-blocked`)&&be(0)}function we(e=!1){if(!o){e&&h.phase===`permission-blocked`&&(h.permissionState=`unknown`,be(0));return}let t=++w,n;try{n=o()}catch{e&&h.phase===`permission-blocked`&&be(0);return}Promise.resolve(n).then(n=>{t!==w||!h.desiredActive||g||Ce(n,e)}).catch(()=>{t===w&&e&&h.phase===`permission-blocked`&&be(0)})}function Te(){if(C.length===0&&s&&(C=[rt(s,`pagehide`,F),rt(s,`freeze`,F),rt(s,`visibilitychange`,Se),rt(s,`pageshow`,Se),rt(s,`resume`,Se),rt(s,`focus`,Se),rt(s,`online`,Se)]),!ae&&a)try{let e=a(e=>Ce(e));ae=typeof e==`function`?e:()=>{}}catch{ae=()=>{}}}function Ee(){for(let e of C.splice(0))try{e()}catch{}if(ae){try{ae()}catch{}ae=null}w+=1}function De(){return g||h.desiredActive?O():(h.desiredActive=!0,_=!1,h.lastSignalAt=null,h.lastFixAt=null,h.lastProviderTimestamp=null,h.consecutiveTimestampAnomalies=0,h.consecutiveFailures=0,h.restartCount=0,E=0,oe=0,D=null,h.lastError=null,Te(),h.permissionState===`denied`?(h.generation+=1,h.phase=`permission-blocked`,k(),we(),O()):(h.generation+=1,ye(h.generation,!1),we(),O()))}function Ne(){return!h.desiredActive&&h.phase===`idle`?O():(h.desiredActive=!1,h.generation+=1,A(`recovery`),N(),Ee(),h.phase=`idle`,h.watchId=null,h.activeSource=null,h.lastProviderTimestamp=null,h.consecutiveTimestampAnomalies=0,oe=0,D=null,h.consecutiveFailures=0,h.lastError=null,k(),O())}function Pe(e={}){let t=d.intervalMs;return e.intervalSeconds!==void 0&&e.intervalMs===void 0&&(e={...e,intervalMs:Number(e.intervalSeconds)*1e3}),e.intervalMs!==void 0&&(d.intervalMs=I(e.intervalMs,d.intervalMs)),e.pollIntervalMs===void 0?p&&d.intervalMs!==t&&(d.pollIntervalMs=d.intervalMs):(d.pollIntervalMs=I(e.pollIntervalMs,d.pollIntervalMs),p=!1),e.staleTimeoutMs===void 0?f&&d.intervalMs!==t&&(d.staleTimeoutMs=Math.max(Me,d.intervalMs*4)):(d.staleTimeoutMs=I(e.staleTimeoutMs,d.staleTimeoutMs),f=!1),e.retryBaseMs!==void 0&&(d.retryBaseMs=I(e.retryBaseMs,d.retryBaseMs)),e.retryMaxMs!==void 0&&(d.retryMaxMs=I(e.retryMaxMs,d.retryMaxMs)),e.lifecycleDebounceMs!==void 0&&(d.lifecycleDebounceMs=I(e.lifecycleDebounceMs,d.lifecycleDebounceMs)),e.timestampNonProgressLimit!==void 0&&(d.timestampNonProgressLimit=Math.max(1,Math.floor(I(e.timestampNonProgressLimit,d.timestampNonProgressLimit)))),e.consumerTimeoutMs===void 0?m&&d.intervalMs!==t&&(d.consumerTimeoutMs=Math.max(Le,d.intervalMs*2)):(d.consumerTimeoutMs=I(e.consumerTimeoutMs,d.consumerTimeoutMs),m=!1),e.positionOptions!==void 0&&(d.positionOptions=e.positionOptions),h.desiredActive&&(h.activeSource===`poll`&&v!==null&&ge(h.generation),h.activeSource&&le(h.generation),b&&(A(`consume`),fe(h.generation))),k(),O()}function Re(){return!h.desiredActive||g||xe(),O()}function ze(){Ne(),g=!0}return{start:De,stop:Ne,configure:Pe,checkHealth:Re,destroy:ze,getState:O}}var at=new Set([`visibilitychange`,`freeze`,`resume`]);function ot({windowRef:e=globalThis.window,documentRef:t=globalThis.document}={}){function n(n){return at.has(n)?t:e}return{isVisible(){return t?.visibilityState!==`hidden`},addEventListener(e,t){let r=n(e);typeof r?.addEventListener==`function`&&r.addEventListener(e,t)},removeEventListener(e,t){n(e)?.removeEventListener?.(e,t)}}}var st=2e3,ct=1e5,lt=[{zoomMin:0,zoomMax:7,maxPoints:0,maxLineVertices:300,pointInterval:1/0},{zoomMin:8,zoomMax:12,maxPoints:80,maxLineVertices:1e3,pointInterval:5},{zoomMin:13,zoomMax:15,maxPoints:200,maxLineVertices:3e3,pointInterval:2},{zoomMin:16,zoomMax:99,maxPoints:500,maxLineVertices:5e3,pointInterval:1}],ut=2e7;function dt(e){if(e==null||e===``||typeof e==`boolean`)return null;let t=Number(e);return Number.isFinite(t)?t:null}function ft(e,{min:t,max:n}){if(typeof e==`string`&&!/^-?\d+$/.test(e.trim()))return null;let r=Number(e);return Number.isInteger(r)&&r>=t&&r<=n?r:null}function pt(e,t,n=()=>globalThis.localStorage){try{return n()?.getItem?.(e)??t}catch{return t}}function mt(e,t,{min:n=-(2**53-1),max:r=2**53-1}={},i=()=>globalThis.localStorage){let a=Number(pt(e,String(t),i));return Number.isInteger(a)&&a>=n&&a<=r?a:t}function ht(e){let t=dt(e);return t===null?0:Math.max(0,Math.floor(t))}function gt(e,t){if(!Array.isArray(e))return!1;let n=ht(t);return n===0||e.length<=n?!1:(e.splice(0,e.length-n),!0)}function _t(e){return Array.isArray(e)?[...e]:e&&typeof e==`object`?{...e}:e}function vt(e){return!e||typeof e!=`object`?null:{...e,latlng:_t(e.latlng),locationSample:e.locationSample&&typeof e.locationSample==`object`?{...e.locationSample}:e.locationSample}}function yt(){return{active:!1,segments:[],historyPoints:[],lastPosition:null}}function bt(e,{active:t=!1,currentPosition:n=null,maxHistoryPoints:r=0,preserveSegments:i=!1}={}){return!e||typeof e!=`object`?e:(e.active=!!t,i||(e.segments=[]),e.historyPoints=[],e.lastPosition=e.active?xt(n):null,wt(e,r),e)}function xt(e){let t=vt(e);return t?(t.firstTimestamp=t.timestamp,t.staySeconds=0,t):null}function St(e,{maxHistoryPoints:t=0}={}){return!e||typeof e!=`object`?e:(e.active&&(e.historyPoints.length>0||e.lastPosition)&&e.segments.push({historyPoints:e.historyPoints,lastPosition:e.lastPosition}),e.active=!1,e.historyPoints=[],e.lastPosition=null,wt(e,t),e)}function z(e,{currentPosition:t=null,maxHistoryPoints:n=0}={}){return!e||typeof e!=`object`?e:(e.active=!0,e.historyPoints=[],e.lastPosition=xt(t),wt(e,n),e)}function B(e,t,{replaceLast:n=!1,maxHistoryPoints:r=0}={}){if(!e?.active||!t)return!1;let i=vt(t);if(!i)return!1;if(n&&e.lastPosition){let t=e.lastPosition.firstTimestamp;Number.isFinite(t)&&(i.firstTimestamp=t,i.staySeconds=Number.isFinite(i.timestamp)?Math.max(0,(i.timestamp-t)/1e3):e.lastPosition.staySeconds),e.lastPosition=i}else e.lastPosition&&e.historyPoints.push(e.lastPosition),e.lastPosition=i;return wt(e,r),!0}function Ct(e){return(Array.isArray(e?.historyPoints)?e.historyPoints.length:0)+ +!!e?.lastPosition}function wt(e,t){if(!e||typeof e!=`object`)return!1;let n=ht(t);if(n===0)return!1;let r=Array.isArray(e.segments)?e.segments:e.segments=[],i=Array.isArray(e.historyPoints)?e.historyPoints:e.historyPoints=[],a=n+1,o=r.reduce((e,t)=>e+Ct(t),0)+i.length+ +!!e.lastPosition,s=o-a;if(s<=0)return!1;for(;s>0&&r.length>0;){let e=r[0],t=Array.isArray(e?.historyPoints)?e.historyPoints:[],n=Math.min(s,t.length);n>0&&(t.splice(0,n),s-=n),s>0&&e?.lastPosition&&(e.lastPosition=null,--s),Ct(e)===0&&r.shift()}if(s>0&&i.length>0){let e=Math.min(s,i.length);i.splice(0,e),s-=e}return o=r.reduce((e,t)=>e+Ct(t),0)+i.length+ +!!e.lastPosition,o<=a}function Tt(e){if(!e)return{segments:[],historyPoints:[],lastPosition:null};let t=Array.isArray(e.segments)?[...e.segments]:[];return e.active?{segments:t,historyPoints:Array.isArray(e.historyPoints)?e.historyPoints:[],lastPosition:e.lastPosition||null}:{segments:t,historyPoints:[],lastPosition:null}}function Et(e){return!e||typeof e!=`object`?!1:Array.isArray(e.segments)&&e.segments.some(e=>Ct(e)>0)?!0:e.active?Array.isArray(e.historyPoints)&&e.historyPoints.length>0||!!e.lastPosition:!1}function V(e,t,n=[]){let r=[];for(let e of Array.isArray(n)?n:[]){let t=[...e?.historyPoints||[]];e?.lastPosition&&t.push(e.lastPosition),t.length>0&&r.push(t)}let i=[...e||[]];return t&&i.push(t),i.length>0&&r.push(i),r}function H(e){let t=Number.isFinite(e)?Math.max(0,Math.floor(e)):0;return lt.find(e=>t>=e.zoomMin&&t<=e.zoomMax)||lt[lt.length-1]}function Dt(e){return!Number.isFinite(e)||e<=0?0:Math.max(0,Math.log2(ut/e))}function Ot(e,t){if(!Array.isArray(e)||e.length<=2)return e||[];let n=Math.max(2,Math.floor(t));if(e.length<=n)return e;let r=[e[0]];for(let t=1;t<n-1;t+=1){let i=Math.floor(t*(e.length-1)/(n-1));r.push(e[i])}return r.push(e[e.length-1]),r}function kt(e,t,n=3){if(!Array.isArray(e)||e.length<=2||!t)return e||[];let{south:r,west:i,north:a,east:o}=t;if(![r,i,a,o].every(Number.isFinite))return e;let s=a-r,c=o-i,l=s*(n-1)/2,u=c*(n-1)/2,d=r-l,f=a+l,p=i-u,m=o+u,h=e=>{if(!Array.isArray(e)||e.length<2)return!1;let[t,n]=e;return n>=d&&n<=f&&t>=p&&t<=m},g=[];for(let t=0;t<e.length;t++){let n=h(e[t]),r=t>0&&h(e[t-1]),i=t<e.length-1&&h(e[t+1]);(n||r||i)&&g.push(e[t])}return g.length>=2?g:e}function At(e,t,n=3){if(!Array.isArray(e)||e.length<=2||!t?.camera)return e||[];let r=t.camera.positionCartographic;if(!r)return e;let i=r.height;if(!Number.isFinite(i)||i<=0)return e;let a=r.latitude*180/Math.PI,o=r.longitude*180/Math.PI,s=Math.min(90,i/111e3*1.5*n),c=Math.min(180,s/Math.max(.1,Math.cos(a*Math.PI/180))),l=a-s,u=a+s,d=o-c,f=o+c,p=e=>{if(!Array.isArray(e)||e.length<2)return!1;let[t,n]=e;return n>=l&&n<=u&&t>=d&&t<=f},m=[];for(let t=0;t<e.length;t++){let n=p(e[t]),r=t>0&&p(e[t-1]),i=t<e.length-1&&p(e[t+1]);(n||r||i)&&m.push(e[t])}return m.length>=2?m:e}function jt(e,t={}){let n=Array.isArray(e?.features)?e.features:[];if(!e?.isLiveTrack)return n;let{viewportBounds:r=null,zoom:i=null,viewer3d:a=null}=t,o=!!(r||a),s=Number.isFinite(i);if(!o&&!s)return Mt(e);let c=s?H(i):{maxPoints:120,maxLineVertices:st,pointInterval:1},l=n.filter(e=>e?.type===`LineString`).length,u=Math.max(2,Math.floor(c.maxLineVertices/Math.max(1,l))),d=[];for(let e=0;e<n.length;e+=1){let t=n[e];if(t?.type!==`LineString`||!Array.isArray(t.coordinates)){t?.type===`LineString`&&d.push({index:e,feature:t});continue}let i=t.coordinates;a?i=At(i,a):r&&(i=kt(i,r)),i=Ot(i,u),i.length>=2&&d.push({index:e,feature:{...t,coordinates:i}})}let f=[];for(let e=0;e<n.length;e+=1){let t=n[e];t?.type===`Point`&&f.push({index:e,feature:t})}if(a)f=f.filter(({feature:e})=>{let t=e.coordinates;if(!Array.isArray(t)||t.length<2)return!1;let n=a.camera.positionCartographic;if(!n)return!0;let r=n.height,i=n.latitude*180/Math.PI,o=n.longitude*180/Math.PI,s=Math.min(90,r/111e3*1.5*3),c=Math.min(180,s/Math.max(.1,Math.cos(i*Math.PI/180))),[l,u]=t;return u>=i-s&&u<=i+s&&l>=o-c&&l<=o+c});else if(r){let{south:e,west:t,north:n,east:i}=r,a=n-e,o=i-t,s=a*2/2,c=o*2/2,l=e-s,u=n+s,d=t-c,p=i+c;f=f.filter(({feature:e})=>{let t=e.coordinates;if(!Array.isArray(t)||t.length<2)return!1;let[n,r]=t;return r>=l&&r<=u&&n>=d&&n<=p})}let p=Math.min(c.maxPoints,500);if(p===0)f=[];else if(f.length>p){let e=Math.max(1,Math.floor(c.pointInterval)||1),t=[];for(let n=f.length-1;n>=0&&t.length<p;n-=e)t.unshift(f[n]);f=t}else if(c.pointInterval>1&&f.length>0){let e=Math.max(1,Math.floor(c.pointInterval)||1);if(e>1){let t=[];for(let n=f.length-1;n>=0;n-=e)t.unshift(f[n]);f=t}}let m=new Set([...d.map(e=>e.index),...f.map(e=>e.index)]),h=new Map(d.map(e=>[e.index,e.feature]));return n.flatMap((e,t)=>{if(!m.has(t))return[];let n=h.get(t);return n?[n]:[e]})}function Mt(e){let t=Array.isArray(e?.features)?e.features:[],n=dt(e.renderPointLimit),r=n===null?120:Math.max(0,Math.floor(n)),i=Array(t.length).fill(!1),a=t.filter(e=>e?.type===`LineString`).length,o=dt(e.renderLinePointLimit),s=Math.max(2,Math.floor((o===null?st:Math.max(2,Math.floor(o)))/Math.max(1,a)));for(let e=t.length-1;e>=0;--e){if(t[e]?.type!==`Point`){i[e]=!0;continue}r>0&&(i[e]=!0,--r)}return t.flatMap((e,t)=>{if(e?.type===`Point`&&!i[t])return[];if(e?.type!==`LineString`||!Array.isArray(e.coordinates)||e.coordinates.length<=s)return[e];let n=[e.coordinates[0]];for(let t=1;t<s-1;t+=1){let r=Math.floor(t*(e.coordinates.length-1)/(s-1));n.push(e.coordinates[r])}return n.push(e.coordinates[e.coordinates.length-1]),[{...e,coordinates:n}]})}function U(e={}){let t=e.value||`default`,n=e.options||[],r=e.attrs||``,i=n.find(e=>e.value===t)||n[0]||{label:`请选择`,value:``},a=n.map(e=>`<div class="custom-select-option ${e.value===t?`selected`:``}" data-value="${e.value}">${e.label}</div>`).join(``);return`
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
  `}function Nt(e={}){let t=e.value||`#0f766e`,n=e.attrs||``,r=t.startsWith(`#`)?t.slice(1):t,i=[`#0f766e`,`#10b981`,`#3b82f6`,`#f97316`,`#ef4444`,`#8b5cf6`,`#ec4899`,`#22c55e`,`#f59e0b`,`#64748b`].map(e=>`<div class="custom-color-swatch" style="background-color: ${e};" data-color="${e}" title="${e}"></div>`).join(``);return`
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
  `}function Pt(){if(typeof window>`u`||window.__customControlsInitialized)return;window.__customControlsInitialized=!0;let e=()=>{document.body.querySelectorAll(`.custom-select-options.is-open`).forEach(e=>{e.classList.remove(`is-open`);let t=e.__parentControl;t&&(t.classList.remove(`is-open`),t.appendChild(e)),e.style.position=``,e.style.zIndex=``,e.style.width=``,e.style.top=``,e.style.left=``,e.style.margin=``}),document.body.querySelectorAll(`.custom-color-dropdown.is-open`).forEach(e=>{e.classList.remove(`is-open`);let t=e.__parentControl;t&&(t.classList.remove(`is-open`),t.appendChild(e)),e.style.position=``,e.style.zIndex=``,e.style.top=``,e.style.left=``,e.style.margin=``}),document.querySelectorAll(`.custom-select.is-open`).forEach(e=>e.classList.remove(`is-open`)),document.querySelectorAll(`.custom-color-picker.is-open`).forEach(e=>e.classList.remove(`is-open`))},t=e=>{Object.prototype.hasOwnProperty.call(e,`value`)||Object.defineProperty(e,"value",{get(){return this.getAttribute(`data-value`)},set(e){this.setAttribute(`data-value`,e);let t=this.querySelector(`.custom-select-trigger span`),n=this.querySelector(`.custom-select-options`)||document.body.querySelector(`.custom-select-options[data-kml-id="${this.getAttribute(`data-kml-id`)}"]`);n&&n.querySelectorAll(`.custom-select-option`).forEach(n=>{let r=n.getAttribute(`data-value`)===e;n.classList.toggle(`selected`,r),r&&t&&(t.textContent=n.textContent)})},configurable:!0})},n=e=>{Object.prototype.hasOwnProperty.call(e,`value`)||Object.defineProperty(e,"value",{get(){return this.getAttribute(`data-color`)},set(e){this.setAttribute(`data-color`,e);let t=this.querySelector(`.custom-color-trigger`);t&&(t.style.backgroundColor=e);let n=this.querySelector(`.custom-color-hidden-input`)||document.body.querySelector(`.custom-color-dropdown[data-kml-id="${this.getAttribute(`data-kml-id`)}"] .custom-color-hidden-input`);n&&(n.value=e);let r=this.querySelector(`.custom-color-hex-input`)||document.body.querySelector(`.custom-color-dropdown[data-kml-id="${this.getAttribute(`data-kml-id`)}"] .custom-color-hex-input`);r&&(r.value=e.startsWith(`#`)?e.slice(1):e)},configurable:!0})};document.addEventListener(`click`,t=>{t.target.closest(`.custom-select-trigger, .custom-color-trigger, .custom-color-dropdown`)||e()},!0),document.addEventListener(`scroll`,()=>e(),{capture:!0,passive:!0}),document.addEventListener(`click`,r=>{let i=r.target,a=i.closest(`.custom-select-trigger`);if(a){r.stopPropagation(),r.preventDefault();let t=a.closest(`.custom-select`);if(t){let n=t.classList.contains(`is-open`);if(e(),!n){t.classList.add(`is-open`);let e=t.querySelector(`.custom-select-options`);if(e){e.__parentControl=t;let n=a.getBoundingClientRect();e.style.position=`fixed`,e.style.zIndex=`99999`,e.style.margin=`0`,e.style.width=`${n.width}px`,e.style.top=`${n.bottom+4}px`,e.style.left=`${n.left}px`,document.body.appendChild(e),e.getBoundingClientRect(),e.classList.add(`is-open`)}}}return}let o=i.closest(`.custom-select-option`);if(o){r.stopPropagation(),r.preventDefault();let n=o.closest(`.custom-select-options`)?.__parentControl||o.closest(`.custom-select`);if(n){t(n);let r=o.getAttribute(`data-value`);r!==n.value&&(n.value=r,n.dispatchEvent(new Event(`change`,{bubbles:!0}))),e()}return}let s=i.closest(`.custom-color-trigger`);if(s){r.stopPropagation(),r.preventDefault();let t=s.closest(`.custom-color-picker`);if(t){let n=t.classList.contains(`is-open`);if(e(),!n){t.classList.add(`is-open`);let e=t.querySelector(`.custom-color-dropdown`);if(e){e.__parentControl=t;let n=s.getBoundingClientRect();e.style.position=`fixed`,e.style.zIndex=`99999`,e.style.margin=`0`,e.style.top=`${n.bottom+4}px`;let r=n.right-120;e.style.left=`${r<0?n.left:r}px`,document.body.appendChild(e),e.getBoundingClientRect(),e.classList.add(`is-open`)}}}return}let c=i.closest(`.custom-color-swatch`);if(c){r.stopPropagation(),r.preventDefault();let t=c.closest(`.custom-color-dropdown`)?.__parentControl||c.closest(`.custom-color-picker`);if(t){n(t);let r=c.getAttribute(`data-color`);r!==t.value&&(t.value=r,t.dispatchEvent(new Event(`change`,{bubbles:!0}))),e()}return}let l=i.closest(`.custom-color-hex-btn`);if(l){r.stopPropagation(),r.preventDefault();let t=l.closest(`.custom-color-dropdown`),i=t?.__parentControl||l.closest(`.custom-color-picker`);if(i){let r=t.querySelector(`.custom-color-hex-input`);if(r){let t=r.value.trim();t.startsWith(`#`)||(t=`#`+t),/^#[0-9A-Fa-f]{6}$/.test(t)?(n(i),i.value=t,i.dispatchEvent(new Event(`change`,{bubbles:!0})),e()):r.value=i.value.replace(`#`,``)}}return}let u=i.closest(`.custom-color-custom-btn`);if(u){r.stopPropagation(),r.preventDefault();let e=u.closest(`.custom-color-dropdown`);if(e?.__parentControl||u.closest(`.custom-color-picker`)){let t=e.querySelector(`.custom-color-hidden-input`);t&&t.click()}return}},!0),document.addEventListener(`keydown`,e=>{if(e.key===`Enter`){let t=e.target.closest(`.custom-color-hex-input`);if(t){e.stopPropagation(),e.preventDefault();let n=t.closest(`.custom-color-dropdown`);n&&n.querySelector(`.custom-color-hex-btn`)?.click()}}},!0),document.addEventListener(`input`,e=>{let t=e.target;if(t.matches(`.custom-color-hidden-input`)){let e=t.closest(`.custom-color-dropdown`)?.__parentControl||t.closest(`.custom-color-picker`);e&&(n(e),e.value=t.value,e.dispatchEvent(new Event(`change`,{bubbles:!0})))}})}function Ft(e){let t=new DOMParser().parseFromString(e,`text/xml`);if(t.querySelector(`parsererror`))throw Error(`KML 文件解析失败，可能格式不正确`);let n=t.getElementsByTagName(`Placemark`),r=[];for(let e=0;e<n.length;e++){let t=n[e],i=t.getElementsByTagName(`name`)[0],a=t.getElementsByTagName(`description`)[0],o=t.getElementsByTagName(`styleUrl`)[0],s=i?.textContent.trim()||``,c=a?It(a):``,l=o?.textContent.trim()||``,u=null,d=null,f=t.getElementsByTagName(`Point`)[0],p=t.getElementsByTagName(`LineString`)[0],m=t.getElementsByTagName(`Polygon`)[0];f?(u=`Point`,d=Lt(f.getElementsByTagName(`coordinates`)[0]?.textContent||``)[0]):p?(u=`LineString`,d=Lt(p.getElementsByTagName(`coordinates`)[0]?.textContent||``)):m&&(u=`Polygon`,d=Lt(m.getElementsByTagName(`outerBoundaryIs`)[0]?.getElementsByTagName(`coordinates`)[0]?.textContent||``)),u&&d&&r.push({id:`feat-${Date.now()}-${Math.random().toString(16).slice(2,8)}`,type:u,name:s,description:c,...l?{styleUrl:l}:{},coordinates:d})}return r}function It(e){let t=new XMLSerializer;return[...e.childNodes].map(e=>e.nodeType===Node.TEXT_NODE||e.nodeType===Node.CDATA_SECTION_NODE?e.nodeValue||``:t.serializeToString(e)).join(``).trim()}function Lt(e){return e.trim().split(/\s+/).map(e=>{let t=e.split(`,`).map(Number);return[t[0],t[1]]}).filter(e=>!isNaN(e[0])&&!isNaN(e[1]))}function Rt(e,t){let n=e=>String(e??``).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`).replace(/'/g,`&apos;`),r=[];r.push(`<?xml version="1.0" encoding="UTF-8"?>`),r.push(`<kml xmlns="http://www.opengis.net/kml/2.2">`),r.push(`  <Document>`),r.push(`    <name>${n(e)}</name>`);for(let e of t){if(r.push(`    <Placemark>`),r.push(`      <name>${n(e.name)}</name>`),r.push(`      <description>${n(e.description)}</description>`),e.type===`Point`)r.push(`      <Point>`),r.push(`        <coordinates>${e.coordinates[0]},${e.coordinates[1]},0</coordinates>`),r.push(`      </Point>`);else if(e.type===`LineString`){r.push(`      <LineString>`);let t=e.coordinates.map(e=>`${e[0]},${e[1]},0`).join(` `);r.push(`        <coordinates>${t}</coordinates>`),r.push(`      </LineString>`)}else if(e.type===`Polygon`){r.push(`      <Polygon>`),r.push(`        <outerBoundaryIs>`),r.push(`          <LinearRing>`);let t=[...e.coordinates],n=t[0],i=t[t.length-1];n&&i&&(n[0]!==i[0]||n[1]!==i[1])&&t.push(n);let a=t.map(e=>`${e[0]},${e[1]},0`).join(` `);r.push(`            <coordinates>${a}</coordinates>`),r.push(`          </LinearRing>`),r.push(`        </outerBoundaryIs>`),r.push(`      </Polygon>`)}r.push(`    </Placemark>`)}return r.push(`  </Document>`),r.push(`</kml>`),r.join(`
`)}var zt=50,Bt=`/api/v1/kml/media`,Vt=new Map([[`down-files.2bulu.com`,new Set([`/f/dn1`])]]),Ht=[`image`,`video`,`audio`,`iframe`,`link`],Ut={image:`图片`,video:`视频`,audio:`音频`,iframe:`页面`,link:`链接`},Wt=new Set([`jpg`,`jpeg`,`png`,`webp`,`gif`,`avif`,`bmp`,`svg`]),Gt=new Set([`mp4`,`webm`,`mov`,`m4v`,`m3u8`,`ogv`]),Kt=new Set([`mp3`,`wav`,`ogg`,`oga`,`m4a`,`aac`,`flac`,`opus`]),W=new Set([`token`,`access_token`,`key`,`api_key`,`apikey`,`secret`,`password`,`signature`,`sign`,`session`,`tk`,`appid`]),qt=new Set(`address.article.aside.blockquote.div.dl.fieldset.figcaption.figure.footer.form.h1.h2.h3.h4.h5.h6.header.li.main.nav.ol.p.pre.section.table.tr.ul`.split(`.`)),G={amp:`&`,apos:`'`,gt:`>`,lt:`<`,nbsp:` `,quot:`"`};function Jt(e){let t=String(e||``).trim();for(;/^[<([{"'“‘]+/.test(t);)t=t.slice(1);for(;/[>),.;:!?，。；：！？、\]}"'”’]+$/.test(t);)t=t.slice(0,-1);return t.trim()}function Yt(e){let t=Jt(rn(e));if(!t)return null;try{return new URL(t)}catch{return null}}function Xt(e){let t=Yt(e);if(!t||t.protocol!==`https:`||t.username||t.password||t.port&&t.port!==`443`||!Vt.get(t.hostname.toLowerCase())?.has(t.pathname))return``;let n=[...t.searchParams.keys()];return n.length!==1||n[0]!==`downParams`||!t.searchParams.get(`downParams`)?``:t.toString()}function Zt(e){let t=Xt(e);return t?`${Bt}?url=${encodeURIComponent(t)}`:String(e||``)}function Qt(e){let t=e.split(`.`).map(e=>Number(e));if(t.length!==4||t.some(e=>!Number.isInteger(e)||e<0||e>255))return!1;let[n,r]=t;return n===10||n===127||n===169&&r===254||n===172&&r>=16&&r<=31||n===192&&r===168||n===0}function $t(e){let t=String(e||``).toLowerCase().replace(/^\[|\]$/g,``);return!t||t===`localhost`||t.endsWith(`.localhost`)||t.endsWith(`.local`)||t===`metadata.google.internal`||t===`169.254.169.254`||Qt(t)||t===`::`||t===`::1`||t.startsWith(`fc`)||t.startsWith(`fd`)||t.startsWith(`fe80:`)?!0:t.startsWith(`::ffff:`)?Qt(t.slice(7)):!1}function en(e){let t=new URL(e.toString());for(let e of[...t.searchParams.keys()])W.has(e.toLowerCase())&&t.searchParams.set(e,`****`);return t.toString()}function tn(e){let t=/\.([a-z0-9]+)$/i.exec(e.pathname),n=t?t[1].toLowerCase():``;return Wt.has(n)?`image`:Gt.has(n)?`video`:Kt.has(n)?`audio`:``}function nn(e,t=[]){let n=e.hostname.toLowerCase(),r=`${e.origin}${e.pathname}`.toLowerCase();return t.some(e=>{let t=String(e||``).trim().toLowerCase();if(!t)return!1;if(t.startsWith(`https://`))return r.startsWith(t);if(t.startsWith(`*.`)){let e=t.slice(1);return n.endsWith(e)&&n!==e.slice(1)}return n===t})}function rn(e){return String(e||``).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(e,t)=>{let n=t.toLowerCase();if(n.startsWith(`#x`)){let t=Number.parseInt(n.slice(2),16);return an(t)?String.fromCodePoint(t):e}if(n.startsWith(`#`)){let t=Number.parseInt(n.slice(1),10);return an(t)?String.fromCodePoint(t):e}return G[n]??e})}function an(e){return Number.isInteger(e)&&e>=0&&e<=1114111&&!(e>=55296&&e<=57343)}function on(e){let t={},n=/([^\s"'=<>`]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g,r;for(;(r=n.exec(e))!==null;)t[r[1].toLowerCase()]=rn(r[2]??r[3]??r[4]??``);return t}function sn(e){let t=String(e||``).toLowerCase();return t.startsWith(`image/`)?`image`:t.startsWith(`video/`)?`video`:t.startsWith(`audio/`)?`audio`:``}function cn(e){return String(e||``).split(`,`)[0]?.trim().split(/\s+/)[0]||``}function ln(e){let t=[],n=[],r=/<\s*(\/?)\s*([a-z][\w:-]*)\b([^>]*)>/gi,i,a=(e,n,r,i,a)=>{e&&t.push({url:e,typeHint:n||``,tagName:r,title:i.alt||i.title||``,index:a})};for(;(i=r.exec(e))!==null;){let e=!!i[1],t=i[2].toLowerCase();if(e){let e=n.map(e=>e.tagName).lastIndexOf(t);e!==-1&&n.splice(e);continue}let r=on(i[3]),o=/\/\s*$/.test(i[3]);if(t===`img`)a(r.src||cn(r.srcset),`image`,t,r,i.index);else if(t===`image`)a(r.href||r[`xlink:href`],`image`,t,r,i.index);else if(t===`video`||t===`audio`)a(r.src,t,t,r,i.index),o||n.push({tagName:t,type:t});else if(t===`picture`)o||n.push({tagName:t,type:`image`});else if(t===`source`){let e=n.at(-1)?.type||``;a(r.src||cn(r.srcset),e||sn(r.type),t,r,i.index)}else t===`iframe`?a(r.src,`iframe`,t,r,i.index):t===`embed`?a(r.src,sn(r.type),t,r,i.index):t===`object`?a(r.data,sn(r.type),t,r,i.index):t===`a`&&a(r.href,``,t,r,i.index)}return t}function un(e,t={}){let n=Number.isInteger(t.limit)?t.limit:zt,r=String(e||``),i=ln(r),a=/https?:\/\/[^\s<>"'`]+/gi,o;for(;(o=a.exec(r))!==null;)i.push({url:o[0],typeHint:``,tagName:``,title:``,index:o.index});i.sort((e,t)=>e.index-t.index);let s=[],c=new Map,l=!1;for(let e of i){let t=Yt(e.url);if(!t)continue;let r=t.toString(),i=c.get(r);if(i){!i.typeHint&&e.typeHint&&(i.typeHint=e.typeHint,i.tagName=e.tagName),!i.title&&e.title&&(i.title=e.title);continue}if(s.length>=n){l=!0;continue}let a={url:t,typeHint:e.typeHint,tagName:e.tagName,title:e.title};s.push(a),c.set(r,a)}return{references:s,truncated:l}}function K(e,t,n={}){let r=[`image`,`video`,`audio`,`iframe`].includes(n.typeHint)?n.typeHint:``,i=[`image`,`video`,`audio`].includes(r)?r:tn(e)||`link`;(r===`iframe`||i===`link`&&nn(e,n.iframeAllowlist))&&(i=nn(e,n.iframeAllowlist)?`iframe`:`link`);let a=en(e),o=i===`image`?Zt(a):a;return{id:`description-link-${t+1}`,type:i,title:String(n.title||``).trim()||e.hostname,description:``,url:a,renderUrl:o,displayUrl:a,thumbnailUrl:i===`image`?o:``,sourceType:`description-link`,autoplay:i===`video`,embedPolicy:i===`iframe`?{sandbox:`allow-scripts allow-forms allow-popups`,referrerPolicy:`no-referrer`}:null}}function dn(e,t={}){let n=Yt(e);return n?n.protocol===`https:`?$t(n.hostname)?{accepted:!1,reason:`URL 主机不允许访问`}:{accepted:!0,item:K(n,Number(t.index||0),t)}:{accepted:!1,reason:`仅支持 HTTPS URL`}:{accepted:!1,reason:`URL 格式不合法`}}function fn(e,t={}){let{references:n,truncated:r}=un(e?.description||``,t),i=hn(e?.styleUrl),a=[],o=Ht.map(e=>({type:e,title:Ut[e],items:[]})),s=new Map(o.map(e=>[e.type,e]));n.forEach((e,n)=>{let r=[`embed`,`object`].includes(e.tagName)&&!e.typeHint&&i===`video`?`video`:e.typeHint,o=dn(e.url.toString(),{...t,index:n,typeHint:r,title:e.title,tagName:e.tagName});if(!o.accepted){a.push({url:en(e.url),reason:o.reason});return}s.get(o.item.type)?.items.push(o.item)});let c={imageCount:s.get(`image`).items.length,videoCount:s.get(`video`).items.length,audioCount:s.get(`audio`).items.length,iframeCount:s.get(`iframe`).items.length,linkCount:s.get(`link`).items.length};return c.hasRichContent=Ht.some(e=>s.get(e).items.length>0),{featureId:String(e?.id||``),groups:o,contentSummary:c,sourceSummary:{bindings:0,libraries:0,descriptionLinks:n.length,rejected:a.length,truncated:r},rejected:a}}function pn(e={}){let t=[];return e.imageCount&&t.push(`${e.imageCount} 张图片`),e.videoCount&&t.push(`${e.videoCount} 个视频`),e.audioCount&&t.push(`${e.audioCount} 段音频`),e.iframeCount&&t.push(`${e.iframeCount} 个页面`),e.linkCount&&t.push(`${e.linkCount} 个链接`),t.join(` / `)}function mn(e){let t=String(typeof e==`object`?e?.description||``:e||``);return t=t.replace(/^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/i,`$1`),t=t.replace(/<!--[\s\S]*?-->/g,``).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,``).replace(/<br\s*\/?>/gi,`
`).replace(/<\s*\/\s*([a-z][\w:-]*)\s*>/gi,(e,t)=>qt.has(t.toLowerCase())?`
`:``).replace(/<[^>]*>/g,``),rn(t).replace(/\u00a0/g,` `).split(/\r?\n/).map(e=>e.replace(/[\t ]+/g,` `).trim()).filter(Boolean).join(`
`)}function hn(e){let t=String(e||``).toLowerCase();return/(?:picture|photo|image)/.test(t)?`image`:/video/.test(t)?`video`:/(?:sound|audio)/.test(t)?`audio`:``}function gn(e,t={}){let{references:n}=un(e?.description||``,t),r=n.flatMap((e,n)=>{let r=dn(e.url.toString(),{...t,index:n,typeHint:e.typeHint});return r.accepted?e.typeHint||r.item.type:[]}),i=hn(e?.styleUrl);return[...new Set([i,...r].filter(Boolean))]}function _n(e,t={}){return gn(e,t)[0]||``}var vn=new Set([`image`,`video`,`audio`,`iframe`]);function yn(e,t,n){let r=/description-link-(\d+)$/i.exec(String(e?.id||``));if(r)return Number(r[1]);let i=Number(e?.sortOrder);return Number.isFinite(i)?i:1e5+t*1e4+n}function bn(e,t){return e?e instanceof Map?e.get(t)||null:e[t]||null:null}function xn(e){try{return new URL(e).hostname}catch{return``}}function Sn(e,t,n={}){let r=t||fn(e,n.contentOptions),i=String(e?.name||``).trim()||`未命名点位`,a=String(e?.id||``),o=[];return(r?.groups||[]).forEach((t,n)=>{vn.has(t?.type)&&(t.items||[]).forEach((r,s)=>{let c=String(r?.title||``).trim();o.push({...r,title:c&&c!==xn(r?.url)?c:i,type:t.type,featureId:a,featureName:i,featureType:String(e?.type||``),sourceOrder:yn(r,n,s)})})}),o.sort((e,t)=>e.sourceOrder-t.sourceOrder),o.map((e,t)=>({...e,featureMediaIndex:t,galleryId:`${a||`feature`}:${e.id||e.type}:${t}`}))}function Cn(e,t={}){let n=Array.isArray(e?.features)?e.features:[],r=String(e?.id||``),i=String(e?.name||``).trim()||`未命名 KML`;return n.flatMap((e,n)=>{let a=String(e?.id||``);return Sn(e,bn(t.featureViews,a),t).map(e=>({...e,kmlId:r,kmlName:i,featureIndex:n}))}).map((e,t)=>({...e,galleryIndex:t}))}function wn(e,t={}){if(!Array.isArray(e)||!e.length)return 0;let n=String(t.featureId||``),r=String(t.id||``),i=String(t.url||``),a=String(t.type||``),o=Number(t.featureMediaIndex),s=e.findIndex(e=>n&&e.featureId!==n||a&&e.type!==a?!1:r&&e.id===r||i&&e.url===i&&(!a||e.type===a)||!r&&!i&&a?!0:Number.isInteger(o)&&e.featureMediaIndex===o);return s===-1&&n&&(s=e.findIndex(e=>e.featureId===n)),s===-1?0:s}function Tn(e,t={}){let n=Math.max(1,Number.parseInt(t.limit,10)||4),r=t.view||fn(e,t.contentOptions),i=Sn(e,r,t),a=i.length>n?Math.max(1,n-1):n,o=i.slice(0,a);return{items:o,overflowItem:i[o.length]||null,total:i.length,remaining:Math.max(0,i.length-a),contentSummary:r?.contentSummary||{}}}typeof window<`u`&&(window.NodeList&&!NodeList.prototype.forEach&&(NodeList.prototype.forEach=Array.prototype.forEach),typeof window.CustomEvent!=`function`&&(window.CustomEvent=function(e,t){t||={bubbles:!1,cancelable:!1,detail:null};var n=document.createEvent(`CustomEvent`);return n.initCustomEvent(e,t.bubbles,t.cancelable,t.detail),n}));var En=typeof document<`u`&&!!document.documentMode,Dn;function On(){return Dn||=document.createElement(`div`).style}var kn=[`webkit`,`moz`,`ms`],An={};function jn(e){if(An[e])return An[e];let t=On();if(e in t)return An[e]=e;let n=e[0].toUpperCase()+e.slice(1),r=kn.length;for(;r--;){let i=`${kn[r]}${n}`;if(i in t)return An[e]=i}}function Mn(e,t){return parseFloat(t[jn(e)])||0}function Nn(e,t,n=window.getComputedStyle(e)){let r=t===`border`?`Width`:``;return{left:Mn(`${t}Left${r}`,n),right:Mn(`${t}Right${r}`,n),top:Mn(`${t}Top${r}`,n),bottom:Mn(`${t}Bottom${r}`,n)}}function Pn(e,t,n){e.style[jn(t)]=n}function Fn(e,t){Pn(e,`transition`,`${jn(`transform`)} ${t.duration}ms ${t.easing}`)}function In(e,{x:t,y:n,scale:r,isSVG:i},a){if(Pn(e,`transform`,`scale(${r}) translate(${t}px, ${n}px)`),i&&En){let t=window.getComputedStyle(e).getPropertyValue(`transform`);e.setAttribute(`transform`,t)}}function Ln(e){let t=e.parentNode;(!t||t.nodeType!==1)&&(t=document.documentElement);let n=window.getComputedStyle(e),r=window.getComputedStyle(t),i=e.getBoundingClientRect(),a=t.getBoundingClientRect();return{elem:{style:n,width:i.width,height:i.height,top:i.top,bottom:i.bottom,left:i.left,right:i.right,margin:Nn(e,`margin`,n),border:Nn(e,`border`,n)},parent:{style:r,width:a.width,height:a.height,top:a.top,bottom:a.bottom,left:a.left,right:a.right,padding:Nn(t,`padding`,r),border:Nn(t,`border`,r)}}}var Rn={down:`mousedown`,move:`mousemove`,up:`mouseup mouseleave`};typeof window<`u`&&(typeof window.PointerEvent==`function`?Rn={down:`pointerdown`,move:`pointermove`,up:`pointerup pointerleave pointercancel`}:typeof window.TouchEvent==`function`&&(Rn={down:`touchstart`,move:`touchmove`,up:`touchend touchcancel`}));function zn(e,t,n,r){Rn[e].split(` `).forEach(e=>{t.addEventListener(e,n,r)})}function Bn(e,t,n){Rn[e].split(` `).forEach(e=>{t.removeEventListener(e,n)})}function Vn(e,t){let n=e.length;for(;n--;)if(e[n].pointerId===t.pointerId)return n;return-1}function Hn(e,t){let n;if(t.touches){n=0;for(let r of t.touches)r.pointerId=n++,Hn(e,r);return}n=Vn(e,t),n>-1&&e.splice(n,1),e.push(t)}function Un(e,t){if(t.touches){for(;e.length;)e.pop();return}let n=Vn(e,t);n>-1&&e.splice(n,1)}function Wn(e){e=e.slice(0);let t=e.pop(),n;for(;n=e.pop();)t={clientX:(n.clientX-t.clientX)/2+t.clientX,clientY:(n.clientY-t.clientY)/2+t.clientY};return t}function Gn(e){if(e.length<2)return 0;let t=e[0],n=e[1];return Math.sqrt(Math.abs(n.clientX-t.clientX)**2+Math.abs(n.clientY-t.clientY)**2)}function Kn(e){let t=e;for(;t&&t.parentNode;){if(t.parentNode===document)return!0;t=t.parentNode instanceof ShadowRoot?t.parentNode.host:t.parentNode}return!1}function qn(e){return(e.getAttribute(`class`)||``).trim()}function Jn(e,t){return e.nodeType===1&&` ${qn(e)} `.indexOf(` ${t} `)>-1}function Yn(e,t){for(let n=e;n!=null;n=n.parentNode)if(Jn(n,t.excludeClass)||t.exclude.indexOf(n)>-1)return!0;return!1}var Xn=/^http:[\w\.\/]+svg$/;function Zn(e){return Xn.test(e.namespaceURI)&&e.nodeName.toLowerCase()!==`svg`}function Qn(e){let t={};for(let n in e)e.hasOwnProperty(n)&&(t[n]=e[n]);return t}var $n={animate:!1,canvas:!1,cursor:`move`,disablePan:!1,disableZoom:!1,disableXAxis:!1,disableYAxis:!1,duration:200,easing:`ease-in-out`,exclude:[],excludeClass:`panzoom-exclude`,handleStartEvent:e=>{e.preventDefault(),e.stopPropagation()},maxScale:4,minScale:.125,overflow:`hidden`,panOnlyWhenZoomed:!1,pinchAndPan:!1,relative:!1,setTransform:In,startX:0,startY:0,startScale:1,step:.3,touchAction:`none`};function er(e,t){if(!e)throw Error(`Panzoom requires an element as an argument`);if(e.nodeType!==1)throw Error(`Panzoom requires an element with a nodeType of 1`);if(!Kn(e))throw Error(`Panzoom should be called on elements that have been attached to the DOM`);t={...$n,...t};let n=Zn(e),r=e.parentNode;r.style.overflow=t.overflow,r.style.userSelect=`none`,r.style.touchAction=t.touchAction,(t.canvas?r:e).style.cursor=t.cursor,e.style.userSelect=`none`,e.style.touchAction=t.touchAction,Pn(e,`transformOrigin`,typeof t.origin==`string`?t.origin:n?`0 0`:`50% 50%`);function i(){r.style.overflow=``,r.style.userSelect=``,r.style.touchAction=``,r.style.cursor=``,e.style.cursor=``,e.style.userSelect=``,e.style.touchAction=``,Pn(e,`transformOrigin`,``)}function a(n={}){for(let e in n)n.hasOwnProperty(e)&&(t[e]=n[e]);(n.hasOwnProperty(`cursor`)||n.hasOwnProperty(`canvas`))&&(r.style.cursor=e.style.cursor=``,(t.canvas?r:e).style.cursor=t.cursor),n.hasOwnProperty(`overflow`)&&(r.style.overflow=n.overflow),n.hasOwnProperty(`touchAction`)&&(r.style.touchAction=n.touchAction,e.style.touchAction=n.touchAction)}let o=0,s=0,c=1,l=!1;h(t.startScale,{animate:!1,force:!0}),setTimeout(()=>{m(t.startX,t.startY,{animate:!1,force:!0})});function u(t,n,r){if(r.silent)return;let i=new CustomEvent(t,{detail:n});e.dispatchEvent(i)}function d(t,r,i){let a={x:o,y:s,scale:c,isSVG:n,originalEvent:i};return requestAnimationFrame(()=>{typeof r.animate==`boolean`&&(r.animate?Fn(e,r):Pn(e,`transition`,`none`)),r.setTransform(e,a,r),u(t,a,r),u(`panzoomchange`,a,r)}),a}function f(n,r,i,a){let l={...t,...a},u={x:o,y:s,opts:l};if(!a?.force&&(l.disablePan||l.panOnlyWhenZoomed&&c===l.startScale))return u;if(n=parseFloat(n),r=parseFloat(r),l.disableXAxis||(u.x=(l.relative?o:0)+n),l.disableYAxis||(u.y=(l.relative?s:0)+r),l.contain){let t=Ln(e),n=t.elem.width/c,r=t.elem.height/c,a=n*i,o=r*i,s=(a-n)/2,d=(o-r)/2;if(l.contain===`inside`){let e=(-t.elem.margin.left-t.parent.padding.left+s)/i,n=(t.parent.width-a-t.parent.padding.left-t.elem.margin.left-t.parent.border.left-t.parent.border.right+s)/i;u.x=Math.max(Math.min(u.x,n),e);let r=(-t.elem.margin.top-t.parent.padding.top+d)/i,c=(t.parent.height-o-t.parent.padding.top-t.elem.margin.top-t.parent.border.top-t.parent.border.bottom+d)/i;u.y=Math.max(Math.min(u.y,c),r)}else if(l.contain===`outside`){let e=(-(a-t.parent.width)-t.parent.padding.left-t.parent.border.left-t.parent.border.right+s)/i,n=(s-t.parent.padding.left)/i;u.x=Math.max(Math.min(u.x,n),e);let r=(-(o-t.parent.height)-t.parent.padding.top-t.parent.border.top-t.parent.border.bottom+d)/i,c=(d-t.parent.padding.top)/i;u.y=Math.max(Math.min(u.y,c),r)}}return l.roundPixels&&(u.x=Math.round(u.x),u.y=Math.round(u.y)),u}function p(n,r){let i={...t,...r},a={scale:c,opts:i};if(!r?.force&&i.disableZoom)return a;let o=t.minScale,s=t.maxScale;if(i.contain){let n=Ln(e),r=n.elem.width/c,i=n.elem.height/c;if(r>1&&i>1){let e=n.parent.width-n.parent.border.left-n.parent.border.right,a=n.parent.height-n.parent.border.top-n.parent.border.bottom,c=e/r,l=a/i;t.contain===`inside`?s=Math.min(s,c,l):t.contain===`outside`&&(o=Math.max(o,c,l))}}return a.scale=Math.min(Math.max(n,o),s),a}function m(e,t,r,i){let a=f(e,t,c,r);return o!==a.x||s!==a.y?(o=a.x,s=a.y,d(`panzoompan`,a.opts,i)):{x:o,y:s,scale:c,isSVG:n,originalEvent:i}}function h(e,t,n){let r=p(e,t),i=r.opts;if(!t?.force&&i.disableZoom)return;e=r.scale;let a=o,l=s;if(i.focal){let t=i.focal;a=(t.x/e-t.x/c+o*e)/e,l=(t.y/e-t.y/c+s*e)/e}let u=f(a,l,e,{relative:!1,force:!0});return o=u.x,s=u.y,c=e,d(`panzoomzoom`,i,n)}function g(e,n){let r={...t,animate:!0,...n};return h(c*Math.exp((e?1:-1)*r.step),r)}function _(e){return g(!0,e)}function ee(e){return g(!1,e)}function te(t,r,i,a){let o=Ln(e),s={width:o.parent.width-o.parent.padding.left-o.parent.padding.right-o.parent.border.left-o.parent.border.right,height:o.parent.height-o.parent.padding.top-o.parent.padding.bottom-o.parent.border.top-o.parent.border.bottom},l=r.clientX-o.parent.left-o.parent.padding.left-o.parent.border.left-o.elem.margin.left,u=r.clientY-o.parent.top-o.parent.padding.top-o.parent.border.top-o.elem.margin.top;n||(l-=o.elem.width/c/2,u-=o.elem.height/c/2);let d={x:l/s.width*(s.width*t),y:u/s.height*(s.height*t)};return h(t,{...i,animate:!1,focal:d},a)}function v(e,n){e.preventDefault();let r={...t,...n,animate:!1},i=(e.deltaY===0&&e.deltaX?e.deltaX:e.deltaY)<0?1:-1,a=p(c*Math.exp(i*r.step/3),r).scale;return te(a,e,r,e)}function ne(e){let n={...t,animate:!0,force:!0,...e};c=p(n.startScale,n).scale;let r=f(n.startX,n.startY,c,n);return o=r.x,s=r.y,d(`panzoomreset`,n)}let re,y,b,x,S,ie,C=[];function ae(e){if(Yn(e.target,t))return;Hn(C,e),l=!0,t.handleStartEvent(e),re=o,y=s,u(`panzoomstart`,{x:o,y:s,scale:c,isSVG:n,originalEvent:e},t);let r=Wn(C);b=r.clientX,x=r.clientY,S=c,ie=Gn(C)}function w(e){if(!l||re===void 0||y===void 0||b===void 0||x===void 0)return;Hn(C,e);let n=Wn(C),r=C.length>1,i=c;r&&(ie===0&&(ie=Gn(C)),i=p((Gn(C)-ie)*t.step/80+S).scale,te(i,n,{animate:!1},e)),(!r||t.pinchAndPan)&&m(re+(n.clientX-b)/i,y+(n.clientY-x)/i,{animate:!1},e)}function T(e){C.length===1&&u(`panzoomend`,{x:o,y:s,scale:c,isSVG:n,originalEvent:e},t),Un(C,e),l&&(l=!1,re=y=b=x=void 0)}let E=!1;function oe(){E||(E=!0,zn(`down`,t.canvas?r:e,ae),zn(`move`,document,w,{passive:!0}),zn(`up`,document,T,{passive:!0}))}function D(){E=!1,Bn(`down`,t.canvas?r:e,ae),Bn(`move`,document,w),Bn(`up`,document,T)}return t.noBind||oe(),{bind:oe,destroy:D,eventNames:Rn,getPan:()=>({x:o,y:s}),getScale:()=>c,getOptions:()=>Qn(t),handleDown:ae,handleMove:w,handleUp:T,pan:m,reset:ne,resetStyle:i,setOptions:a,setStyle:(t,n)=>Pn(e,t,n),zoom:h,zoomIn:_,zoomOut:ee,zoomToPoint:te,zoomWithWheel:v}}er.defaultOptions=$n;var tr=new Set([`image`,`video`,`audio`,`iframe`]);function nr(e,t){let n=Math.max(0,Number.parseInt(t,10)||0);return n?((Number.parseInt(e,10)||0)%n+n)%n:0}function rr(e){let t=Number(e);return Number.isFinite(t)?Math.min(6,Math.max(1,t)):1}function ir(e,t=``){return Array.isArray(e)?e.flatMap(e=>{let n=String(e?.type||``)||t,r=String(e?.url||``).trim();return!tr.has(n)||!/^https:\/\//i.test(r)?[]:[{...e,type:n,url:r}]}):[]}var ar=`modulepreload`,or=function(e){return`/`+e},sr={},cr=function(e,t,n){let r=Promise.resolve();if(t&&t.length>0){let e=document.getElementsByTagName(`link`),i=document.querySelector(`meta[property=csp-nonce]`),a=i?.nonce||i?.getAttribute(`nonce`);function o(e){return Promise.all(e.map(e=>Promise.resolve(e).then(e=>({status:`fulfilled`,value:e}),e=>({status:`rejected`,reason:e}))))}r=o(t.map(t=>{if(t=or(t,n),t in sr)return;sr[t]=!0;let r=t.endsWith(`.css`),i=r?`[rel="stylesheet"]`:``;if(n)for(let n=e.length-1;n>=0;n--){let i=e[n];if(i.href===t&&(!r||i.rel===`stylesheet`))return}else if(document.querySelector(`link[href="${t}"]${i}`))return;let o=document.createElement(`link`);if(o.rel=r?`stylesheet`:ar,r||(o.as=`script`),o.crossOrigin=``,o.href=t,a&&o.setAttribute(`nonce`,a),document.head.appendChild(o),r)return new Promise((e,n)=>{o.addEventListener(`load`,e),o.addEventListener(`error`,()=>n(Error(`Unable to preload CSS for ${t}`)))})}))}function i(e){let t=new Event(`vite:preloadError`,{cancelable:!0});if(t.payload=e,window.dispatchEvent(t),!t.defaultPrevented)throw e}return r.then(t=>{for(let e of t||[])e.status===`rejected`&&i(e.reason);return e().catch(i)})},lr={image:`图片`,video:`视频`,audio:`音频`,iframe:`页面`},ur=[],q=0,dr=null,J=null,fr=null,pr=null,mr=null,hr=0,gr=null,_r=!1,vr=``,yr=null,br=null;function xr(){return window.matchMedia?.(`(prefers-reduced-motion: reduce)`).matches===!0}function Sr(e){return String(e?.title||lr[e?.type]||`媒体预览`)}function Cr(e){if(e?.displayUrl)return String(e.displayUrl);try{return new URL(e?.url).hostname}catch{return``}}function wr(e){return String(e?.renderUrl||e?.url||``)}function Tr(e){return{video:`▶`,audio:`♪`,iframe:`▣`}[e]||`◫`}function Er(e){return/\.m3u8(?:$|[?#])/i.test(String(e||``))}function Dr(){let e=document.createElement(`div`);return e.id=`app-media-preview`,e.className=`media-preview-root`,e.hidden=!0,e.setAttribute(`aria-hidden`,`true`),e.innerHTML=`
    <section class="media-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="media-preview-title">
      <header class="media-preview-header">
        <div class="media-preview-heading">
          <span class="media-preview-collection" data-media-preview-collection></span>
          <span class="media-preview-kind" data-media-preview-kind></span>
          <h2 id="media-preview-title" data-media-preview-title></h2>
          <span class="media-preview-position" data-media-preview-position aria-live="polite"></span>
        </div>
        <div class="media-preview-header-actions">
          <button type="button" class="media-preview-icon-button media-preview-minimize" data-media-preview-action="minimize" aria-label="收缩为小窗" title="收缩为小窗">⌟</button>
          <a class="media-preview-source" data-media-preview-source target="_blank" rel="noopener noreferrer" title="打开原始文件">
            <span class="media-preview-source-label">原始文件</span><span aria-hidden="true">↗</span>
          </a>
          <button type="button" class="media-preview-icon-button media-preview-close" data-media-preview-action="close" aria-label="关闭预览" title="关闭预览">×</button>
        </div>
      </header>
      <div class="media-preview-stage" data-media-preview-stage tabindex="0" aria-label="媒体查看区域，使用方向键切换">
        <button type="button" class="media-preview-nav media-preview-nav-previous" data-media-preview-action="previous" aria-label="上一项" title="上一项">‹</button>
        <div class="media-preview-content" data-media-preview-content></div>
        <button type="button" class="media-preview-nav media-preview-nav-next" data-media-preview-action="next" aria-label="下一项" title="下一项">›</button>
      </div>
      <nav class="media-preview-track" data-media-preview-track aria-label="KML 媒体浏览轨道"></nav>
      <footer class="media-preview-footer">
        <div class="media-preview-zoom-controls" data-media-preview-zoom-controls hidden>
          <button type="button" class="media-preview-icon-button" data-media-preview-action="zoom-out" aria-label="缩小" title="缩小">−</button>
          <input type="range" min="1" max="6" step="0.01" value="1" data-media-preview-zoom aria-label="图片缩放比例">
          <output data-media-preview-zoom-output>100%</output>
          <button type="button" class="media-preview-icon-button" data-media-preview-action="zoom-in" aria-label="放大" title="放大">+</button>
          <button type="button" class="media-preview-icon-button media-preview-reset" data-media-preview-action="reset" aria-label="复位图片" title="复位图片">↺</button>
        </div>
        <div class="media-preview-meta">
          <strong data-media-preview-caption></strong>
          <span data-media-preview-url></span>
        </div>
      </footer>
      <button type="button" class="media-preview-restore" data-media-preview-action="restore" aria-label="展开媒体预览" title="展开媒体预览">
        <span class="media-preview-restore-icon" aria-hidden="true">▣</span>
        <span class="media-preview-restore-copy"><strong data-media-preview-restore-title>媒体预览</strong><small data-media-preview-restore-position></small></span>
        <span aria-hidden="true">↗</span>
      </button>
    </section>
  `,e.addEventListener(`click`,Kr),e.addEventListener(`input`,qr),document.body.appendChild(e),e}function Or(){return mr||=document.getElementById(`app-media-preview`)||Dr(),mr}function Y(e){return Or().querySelector(e)}function kr(e,t){let n=Y(e);n&&(n.textContent=t)}function Ar(){fr&&pr&&fr.removeEventListener(`wheel`,pr),J?.destroy(),J=null,fr=null,pr=null}function jr(){Ar(),gr?.destroy(),gr=null;let e=Y(`[data-media-preview-content]`);e?.querySelectorAll(`video, audio`).forEach(e=>{e.pause(),e.removeAttribute(`src`),e.load()}),e?.querySelectorAll(`iframe`).forEach(e=>e.removeAttribute(`src`)),e?.replaceChildren()}function Mr(){yr?.disconnect(),yr=null}function Nr(e,t){if(t!==hr||mr?.hidden)return;let n=Y(`[data-media-preview-content]`);if(!n)return;let r=document.createElement(`div`);r.className=`media-preview-load-error`,r.setAttribute(`role`,`status`),r.textContent=e,n.replaceChildren(r)}function Pr(e){let t=rr(e),n=Y(`[data-media-preview-zoom]`),r=Y(`[data-media-preview-zoom-output]`),i=Y(`[data-media-preview-stage]`);n&&(n.value=String(t)),r&&(r.textContent=`${Math.round(t*100)}%`),i?.classList.toggle(`is-zoomed`,t>1.01)}function Fr(e,t=!xr()){J&&J.zoom(rr(e),{animate:t})}function Ir(e=!xr()){J&&(J.reset({animate:e}),Pr(1))}function Lr(e,t){Ar(),J=er(e,{canvas:!0,minScale:1,maxScale:6,startScale:1,step:.2,duration:xr()?0:160,panOnlyWhenZoomed:!0,pinchAndPan:!0,cursor:`grab`}),e.addEventListener(`panzoomchange`,e=>Pr(e.detail?.scale??J?.getScale())),t.addEventListener(`dblclick`,e=>{e.preventDefault(),Fr((J?.getScale()||1)>1.05?1:2)}),fr=t,pr=J.zoomWithWheel,t.addEventListener(`wheel`,pr,{passive:!1}),Pr(1)}function Rr(e,t){let n=Y(`[data-media-preview-content]`);if(!n)return;let r=document.createElement(`div`);r.className=`media-preview-image-canvas`;let i=document.createElement(`img`);i.className=`media-preview-image`,i.alt=Sr(e),i.draggable=!1,i.referrerPolicy=`no-referrer`,i.addEventListener(`load`,()=>{t===hr&&i.isConnected&&Lr(i,r)},{once:!0}),i.addEventListener(`error`,()=>Nr(`图片加载失败`,t),{once:!0}),i.src=wr(e),r.appendChild(i),n.appendChild(r)}async function zr(e,t,n){try{let{default:r}=await cr(async()=>{let{default:e}=await import(`./hls-IujbK-0_.js`);return{default:e}},[]);if(n!==hr||!e.isConnected)return;if(!r.isSupported()){e.src=t;return}gr=new r({enableWorker:!0}),gr.on(r.Events.ERROR,(e,t)=>{t?.fatal&&(gr?.destroy(),gr=null,Nr(`HLS 视频加载失败`,n))}),gr.loadSource(t),gr.attachMedia(e)}catch{n===hr&&e.isConnected&&(e.src=t)}}function Br(e,t){let n=Y(`[data-media-preview-content]`);if(!n)return;let r=document.createElement(`video`);r.className=`media-preview-video`,r.controls=!0,r.autoplay=!0,r.playsInline=!0,r.preload=`metadata`,r.referrerPolicy=`no-referrer`,r.addEventListener(`error`,()=>Nr(`视频加载失败`,t),{once:!0});let i=wr(e);Er(i)&&!r.canPlayType(`application/vnd.apple.mpegurl`)?zr(r,i,t):r.src=i,n.appendChild(r);let a=()=>{if(t!==hr||!r.isConnected)return;r.muted=!1;let e=r.play();e?.catch&&e.catch(()=>{t!==hr||!r.isConnected||(r.muted=!0,r.play().catch(()=>{}))})};a(),r.addEventListener(`loadedmetadata`,a,{once:!0})}function Vr(e,t){let n=Y(`[data-media-preview-content]`);if(!n)return;let r=document.createElement(`div`);r.className=`media-preview-audio-shell`;let i=document.createElement(`span`);i.className=`media-preview-audio-icon`,i.setAttribute(`aria-hidden`,`true`),i.textContent=`♪`;let a=document.createElement(`audio`);a.controls=!0,a.preload=`metadata`,a.addEventListener(`error`,()=>Nr(`音频加载失败`,t),{once:!0}),a.src=wr(e),r.append(i,a),n.appendChild(r)}function Hr(e){let t=Y(`[data-media-preview-content]`);if(!t)return;let n=e.embedPolicy||{},r=document.createElement(`iframe`);r.className=`media-preview-iframe`,r.title=Sr(e),r.loading=`eager`,r.referrerPolicy=n.referrerPolicy||`no-referrer`,r.setAttribute(`sandbox`,n.sandbox||`allow-scripts allow-forms allow-popups`),r.src=e.url,t.appendChild(r)}function Ur(){let e=Y(`[data-media-preview-track]`);if(!e)return;Mr();let t=ur.map(e=>e.galleryId||`${e.type}:${e.url}`).join(`|`),n=e.children.length!==ur.length||e.dataset.signature!==t;n&&(e.replaceChildren(),e.dataset.signature=t),ur.forEach((t,r)=>{if(!n){let t=e.children[r];if(t){t.classList.toggle(`is-active`,r===q),t.tabIndex=r===q?0:-1,t.setAttribute(`aria-current`,r===q?`true`:`false`);return}}let i=document.createElement(`button`);if(i.type=`button`,i.className=`media-preview-track-item`,i.dataset.mediaPreviewAction=`select`,i.dataset.mediaPreviewIndex=String(r),i.tabIndex=r===q?0:-1,i.setAttribute(`aria-current`,r===q?`true`:`false`),i.setAttribute(`aria-label`,`查看第 ${r+1} 项，${lr[t.type]||`媒体`}：${Sr(t)}`),i.title=`${Sr(t)} · ${t.featureName||``}`,t.type===`image`){let e=document.createElement(`img`),n=String(t.thumbnailUrl||t.renderUrl||t.url||``);e.alt=``,e.loading=`lazy`,e.referrerPolicy=`no-referrer`,e.addEventListener(`error`,()=>i.classList.add(`is-load-error`),{once:!0}),`IntersectionObserver`in window?e.dataset.src=n:e.src=n,i.appendChild(e)}else{let e=document.createElement(`span`);e.className=`media-preview-track-icon media-preview-track-icon-${t.type}`,e.setAttribute(`aria-hidden`,`true`),e.textContent=Tr(t.type),i.appendChild(e)}let a=document.createElement(`span`);a.className=`media-preview-track-marker`,a.textContent=String(r+1).padStart(2,`0`),i.appendChild(a),e.appendChild(i)}),`IntersectionObserver`in window&&(yr=new IntersectionObserver(e=>{e.forEach(e=>{if(!e.isIntersecting)return;let t=e.target;t.src=t.dataset.src||``,t.removeAttribute(`data-src`),yr?.unobserve(t)})},{root:e,rootMargin:`0px 160px`}),e.querySelectorAll(`img[data-src]`).forEach(e=>yr.observe(e))),e.querySelectorAll(`.media-preview-track-item`).forEach((e,t)=>{e.classList.toggle(`is-active`,t===q),e.tabIndex=t===q?0:-1,e.setAttribute(`aria-current`,t===q?`true`:`false`)}),e.querySelector(`.media-preview-track-item.is-active`)?.scrollIntoView?.({block:`nearest`,inline:`center`})}function Wr(){let e=++hr;jr();let t=ur[q];if(!t)return;let n=Or(),r=Y(`[data-media-preview-source]`),i=Y(`[data-media-preview-action="previous"]`),a=Y(`[data-media-preview-action="next"]`),o=Y(`[data-media-preview-zoom-controls]`),s=lr[t.type]||`媒体`,c=Sr(t);n.dataset.mediaType=t.type,n.dataset.mediaIndex=String(q),kr(`[data-media-preview-kind]`,s),kr(`[data-media-preview-collection]`,vr||t.kmlName||`媒体预览`),kr(`[data-media-preview-title]`,c),kr(`[data-media-preview-position]`,ur.length>1?`${q+1} / ${ur.length}`:`单项`),kr(`[data-media-preview-caption]`,c),kr(`[data-media-preview-url]`,Cr(t)),kr(`[data-media-preview-restore-title]`,c),kr(`[data-media-preview-restore-position]`,`${q+1} / ${ur.length}`),r&&(r.href=t.url,r.title=t.type===`iframe`?`打开原始页面`:`打开原始文件`),kr(`.media-preview-source-label`,t.type===`iframe`?`原始页面`:`原始文件`);let l=ur.length>1;i&&(i.hidden=!l),a&&(a.hidden=!l),o&&(o.hidden=t.type!==`image`),Pr(1),Ur();let u={image:Rr,video:Br,audio:Vr,iframe:Hr}[t.type];u?.(t,e),br?.(t),_r||Y(`.media-preview-stage`)?.focus({preventScroll:!0})}function Gr(e){ur.length<2||(q=nr(q+e,ur.length),Wr())}function Kr(e){let t=Or();if(e.target===t){Qr();return}let n=e.target.closest(`[data-media-preview-action]`)?.dataset.mediaPreviewAction;n&&(n===`close`&&Qr(),n===`previous`&&Gr(-1),n===`next`&&Gr(1),n===`select`&&(q=nr(e.target.closest(`[data-media-preview-action]`)?.dataset.mediaPreviewIndex,ur.length),Wr()),n===`minimize`&&Zr(!0),n===`restore`&&Zr(!1),n===`zoom-in`&&Fr((J?.getScale()||1)+.5),n===`zoom-out`&&Fr((J?.getScale()||1)-.5),n===`reset`&&Ir())}function qr(e){e.target.matches(`[data-media-preview-zoom]`)&&Fr(Number(e.target.value),!1)}function Jr(e){if(_r)return;let t=Or(),n=[...t.querySelectorAll(`a[href], button:not([hidden]):not([tabindex="-1"]), input:not([hidden]), video[controls], audio[controls]`)].filter(e=>!e.disabled&&e.getClientRects().length);if(!n.length)return;let r=n[0],i=n.at(-1);t.contains(document.activeElement)?e.shiftKey&&document.activeElement===r?(e.preventDefault(),i.focus()):!e.shiftKey&&document.activeElement===i&&(e.preventDefault(),r.focus()):(e.preventDefault(),r.focus())}function Yr(e){if(Or().hidden)return;if(e.key===`Escape`){e.preventDefault(),Qr();return}if(_r){let t=Or();t.contains(e.target)&&e.key===`ArrowLeft`&&(e.preventDefault(),Gr(-1)),t.contains(e.target)&&e.key===`ArrowRight`&&(e.preventDefault(),Gr(1));return}if(e.key===`Tab`&&!_r){Jr(e);return}let t=e.target.matches?.(`input, video, audio`);!t&&(e.key===`ArrowLeft`||e.key===`ArrowUp`)&&(e.preventDefault(),Gr(-1)),!t&&(e.key===`ArrowRight`||e.key===`ArrowDown`)&&(e.preventDefault(),Gr(1)),!t&&ur[q]?.type===`image`&&((e.key===`+`||e.key===`=`)&&(e.preventDefault(),Fr((J?.getScale()||1)+.5)),e.key===`-`&&(e.preventDefault(),Fr((J?.getScale()||1)-.5)),e.key===`0`&&(e.preventDefault(),Ir()))}function Xr(){!Or().hidden&&!_r&&ur[q]?.type===`image`&&Ir(!1)}function Zr(e){let t=Or();if(t.hidden)return;_r=!!e,t.classList.toggle(`is-minimized`,_r),Y(`.media-preview-dialog`)?.setAttribute(`aria-modal`,_r?`false`:`true`),document.body.classList.toggle(`media-preview-open`,!_r);let n=Y(`[data-media-preview-action="minimize"]`);n&&(n.hidden=_r,n.setAttribute(`aria-label`,_r?`预览已收缩`:`收缩为小窗`)),requestAnimationFrame(_r?()=>Y(`[data-media-preview-action="restore"]`)?.focus():()=>Y(`.media-preview-stage`)?.focus({preventScroll:!0}))}function Qr(){let e=mr||document.getElementById(`app-media-preview`);!e||e.hidden||(hr+=1,jr(),Mr(),e.hidden=!0,e.setAttribute(`aria-hidden`,`true`),e.removeAttribute(`data-media-type`),e.classList.remove(`is-minimized`),document.body.classList.remove(`media-preview-open`),document.removeEventListener(`keydown`,Yr),window.removeEventListener(`resize`,Xr),ur=[],q=0,vr=``,br=null,_r=!1,dr?.isConnected&&dr.focus({preventScroll:!0}),dr=null)}function $r({items:e,index:t=0,type:n=``,trigger:r=null,collectionTitle:i=``,onActiveItemChange:a=null}={}){let o=ir(e,n);if(!o.length)return!1;let s=Or();(s.hidden||_r)&&(dr=r||document.activeElement),ur=o,q=nr(t,ur.length),vr=String(i||o[q]?.kmlName||``).trim(),br=typeof a==`function`?a:null,_r=!1,s.classList.remove(`is-minimized`),Y(`.media-preview-dialog`)?.setAttribute(`aria-modal`,`true`);let c=Y(`[data-media-preview-action="minimize"]`);return c&&(c.hidden=!1),s.hidden=!1,s.setAttribute(`aria-hidden`,`false`),document.body.classList.add(`media-preview-open`),document.removeEventListener(`keydown`,Yr),document.addEventListener(`keydown`,Yr),window.removeEventListener(`resize`,Xr),window.addEventListener(`resize`,Xr),Wr(),requestAnimationFrame(()=>Y(`.media-preview-stage`)?.focus({preventScroll:!0})),!0}var ei=``.split(`,`).map(e=>e.trim()).filter(Boolean),ti=null;function X(e){return String(e??``).replaceAll(`&`,`&amp;`).replaceAll(`<`,`&lt;`).replaceAll(`>`,`&gt;`).replaceAll(`"`,`&quot;`).replaceAll(`'`,`&#39;`)}function ni(){let e=typeof window<`u`?window:null,t=e?.MAP_SERVICE_KML_IFRAME_ALLOWLIST||e?.mapServiceKmlIframeAllowlist||ei;return Array.isArray(t)?t:String(t||``).split(`,`).map(e=>e.trim()).filter(Boolean)}function ri(){return{iframeAllowlist:ni()}}function ii(e){return fn(e,ri())}function ai(e){return{image:`图片`,video:`视频`,audio:`音频`,iframe:`页面`}[e]||`媒体`}function oi(e){return{video:`▶`,audio:`♪`,iframe:`▣`}[e]||`◫`}function si(e){let t=String(e?.name||``).trim();return/^未命名(?:点位|要素(?:\s*\d+)?)$/.test(t)?``:t}function ci(e){return si({name:e?.title})||si({name:e?.featureName})}function li(e){let t=ai(e.type),n=ci(e);return e.type===`image`?`
      <button type="button" class="kml-popup-media-item kml-popup-media-image" data-kml-popup-media data-media-id="${X(e.id)}" data-media-url="${X(e.url)}" data-media-type="image" aria-label="预览${X(t)}${n?`：${X(n)}`:``}">
        <img src="${X(e.thumbnailUrl||e.renderUrl||e.url)}" alt="${X(n||`点位图片`)}" loading="lazy" referrerpolicy="no-referrer">
        <span class="kml-popup-media-badge">${X(t)}</span>
        <span class="kml-popup-media-error">图片加载失败</span>
      </button>
    `:`
    <button type="button" class="kml-popup-media-item kml-popup-media-type kml-popup-media-${X(e.type)}" data-kml-popup-media data-media-id="${X(e.id)}" data-media-url="${X(e.url)}" data-media-type="${X(e.type)}" aria-label="预览${X(t)}${n?`：${X(n)}`:``}">
      <span class="kml-popup-media-icon" aria-hidden="true">${X(oi(e.type))}</span>
      <span class="kml-popup-media-copy"><strong>${X(t)}</strong><small>${X(n||`点击查看`)}</small></span>
    </button>
  `}function ui(e,t,n){let r=Tn(t,{contentOptions:ri()}),i=pn(r.contentSummary),a=mn(t),o=n?`
      <div class="kml-popup-actions">
        <button type="button" class="kml-popup-btn kml-detail-btn" data-kml-id="${X(e?.id)}" data-feature-id="${X(t?.id)}">查看详情</button>
        <button type="button" class="kml-popup-btn primary kml-edit-btn" data-kml-id="${X(e?.id)}" data-feature-id="${X(t?.id)}">编辑</button>
        <button type="button" class="kml-popup-btn danger kml-delete-btn" data-kml-id="${X(e?.id)}" data-feature-id="${X(t?.id)}">删除</button>
      </div>
    `:`
      <div class="kml-popup-actions">
        <button type="button" class="kml-popup-btn primary kml-detail-btn" data-kml-id="${X(e?.id)}" data-feature-id="${X(t?.id)}">查看详情</button>
      </div>
    `,s=r.items.length?`
      <section class="kml-popup-media" aria-label="点位媒体预览">
        <div class="kml-popup-media-heading"><span>媒体速览</span><small>${X(r.total)} 项</small></div>
        <div class="kml-popup-media-grid">
          ${r.items.map(li).join(``)}
          ${r.remaining&&r.overflowItem?`<button type="button" class="kml-popup-media-more" data-kml-popup-media data-media-id="${X(r.overflowItem.id)}" data-media-url="${X(r.overflowItem.url)}" data-media-type="${X(r.overflowItem.type)}" aria-label="查看其余 ${X(r.remaining)} 项媒体">+${X(r.remaining)}</button>`:``}
        </div>
      </section>
    `:``,c=si(t),l=c?`<div class="kml-popup-title">${X(c)}</div>`:``,u=a?`<div class="kml-popup-desc">${X(a)}</div>`:``;return`
    <div class="kml-popup-content">
      <div class="kml-popup-eyebrow">${X(e?.name||`KML 点位`)}</div>
      ${l}
      ${u}
      ${i?`<div class="kml-popup-content-summary">${X(i)}</div>`:``}
      ${s}
      ${o}
    </div>
  `}function di(e,t,n=null){let r=Cn(e,{featureViews:n&&t?.id?new Map([[String(t.id),n]]):null,contentOptions:ri()});return r.length?r:Sn(t,n||ii(t)).map((t,n)=>({...t,kmlId:String(e?.id||``),kmlName:String(e?.name||``).trim()||`未命名 KML`,galleryIndex:n}))}function fi(e,t,n,r,i=null){let a=di(e,t,i);return a.length?$r({items:a,index:wn(a,{...n,featureId:String(t?.id||``)}),trigger:r,collectionTitle:String(e?.name||``).trim()||`未命名 KML`,onActiveItemChange:e=>window.activateKmlFeatureForMedia?.(e)}):!1}function pi(e,t,n){e&&(e.querySelectorAll(`.kml-popup-media-image img`).forEach(e=>{e.dataset.kmlPopupMediaFallbackBound!==`true`&&(e.dataset.kmlPopupMediaFallbackBound=`true`,e.addEventListener(`error`,()=>e.closest(`.kml-popup-media-image`)?.classList.add(`is-load-error`),{once:!0}))}),e.querySelectorAll(`[data-kml-popup-media]`).forEach(e=>{e.dataset.kmlPopupMediaBound!==`true`&&(e.dataset.kmlPopupMediaBound=`true`,e.addEventListener(`click`,r=>{r.stopPropagation(),r.preventDefault(),fi(t,n,{id:e.dataset.mediaId,url:e.dataset.mediaUrl,type:e.dataset.mediaType},e)}))}))}function mi(){let e=document.getElementById(`kml-feature-content-panel`);return e||(e=document.createElement(`section`),e.id=`kml-feature-content-panel`,e.className=`kml-content-panel`,e.setAttribute(`role`,`dialog`),e.setAttribute(`aria-modal`,`false`),e.hidden=!0,document.body.appendChild(e)),e}function hi(){ti?.abort(),ti=null;let e=document.getElementById(`kml-feature-content-panel`);e&&(e.hidden=!0,e.innerHTML=``)}async function gi(e,t){if(e?.isPublic&&e.id&&t?.id){ti?.abort(),ti=new AbortController;try{let n=await window.fetch(`/api/v1/kml/shared/${encodeURIComponent(e.id)}/features/${encodeURIComponent(t.id)}/content`,{signal:ti.signal}),r=await n.json();if(!n.ok||r.code!==0)throw Error(r.error?.message||`点位内容加载失败`);return r.result}finally{ti=null}}return ii(t)}function _i(e,t){let n=mn(t),r=Array.isArray(t?.coordinates)&&t.type===`Point`?`${Number(t.coordinates[0]).toFixed(6)}, ${Number(t.coordinates[1]).toFixed(6)}`:``;return`
    <section class="kml-content-overview">
      <div class="kml-content-overview-copy">
        <span>点位说明</span>
        ${n?`<p>${X(n)}</p>`:`<p class="kml-content-muted">暂无文字描述</p>`}
      </div>
      <dl>
        <div><dt>图层</dt><dd>${X(e?.name||`未命名图层`)}</dd></div>
        <div><dt>类型</dt><dd>${X(t?.type||`未知`)}</dd></div>
        ${r?`<div><dt>坐标</dt><dd>${X(r)}</dd></div>`:``}
      </dl>
    </section>
  `}function vi(e,t,n){return`
    <button type="button" class="kml-content-image-item" data-kml-media-preview data-kml-media-group="${n}" data-kml-media-index="${t}" title="预览${X(e.title||`图片`)}" aria-label="预览${X(e.title||`图片`)}">
      <img src="${X(e.thumbnailUrl||e.renderUrl||e.url)}" alt="${X(e.title||`点位图片`)}" loading="lazy" referrerpolicy="no-referrer">
      <span class="kml-content-image-caption"><strong>${X(e.title||`点位图片`)}</strong><small>点击预览</small></span>
      <span class="kml-content-image-error">图片加载失败</span>
    </button>
  `}function yi(e,t,n,r,i,a){return`
    <button type="button" class="kml-content-card kml-content-media-launch kml-content-media-${X(r)}" data-kml-media-preview data-kml-media-group="${n}" data-kml-media-index="${t}" aria-label="预览${X(i)}：${X(e.title||i)}">
      <span class="kml-content-media-launch-icon" aria-hidden="true">${X(a)}</span>
      <span class="kml-content-media-launch-copy">
        <strong>${X(e.title||i)}</strong>
        <small>${X(e.displayUrl||i)}</small>
      </span>
      <span class="kml-content-media-launch-arrow" aria-hidden="true">›</span>
    </button>
  `}function bi(e,t,n){return yi(e,t,n,`video`,`视频`,`▶`)}function xi(e,t,n){return yi(e,t,n,`audio`,`音频`,`♪`)}function Si(e,t,n){return yi(e,t,n,`iframe`,`页面`,`▣`)}function Ci(e){return`
    <a class="kml-content-link-item" href="${X(e.url)}" target="_blank" rel="noopener noreferrer">
      <span>${X(e.title||`链接`)}</span>
      <small>${X(e.displayUrl||e.url)}</small>
    </a>
  `}function wi(e,t){if(!e.items?.length)return``;let n={image:vi,video:bi,audio:xi,iframe:Si,link:Ci}[e.type]||Ci,r={image:`◫`,video:`▶`,audio:`♪`,iframe:`▣`,link:`↗`}[e.type]||`•`;return`
    <section class="kml-content-group kml-content-group-${X(e.type)}">
      <header class="kml-content-group-heading">
        <span aria-hidden="true">${X(r)}</span>
        <div><h3>${X(e.title||`内容`)}</h3><p>${e.items.length} 项内容</p></div>
      </header>
      <div class="kml-content-items">
        ${e.items.map((e,r)=>n(e,r,t)).join(``)}
      </div>
    </section>
  `}function Ti(e){e.querySelectorAll(`.kml-content-image-item img`).forEach(e=>{e.addEventListener(`error`,()=>e.closest(`.kml-content-image-item`)?.classList.add(`is-load-error`),{once:!0})})}function Ei(e,t,n,r){let i=r?.groups||[];e.querySelectorAll(`[data-kml-media-preview]`).forEach(e=>{e.addEventListener(`click`,()=>{let a=i[Number(e.dataset.kmlMediaGroup)],o=a?.items?.[Number(e.dataset.kmlMediaIndex)];o&&fi(t,n,{id:o.id,url:o.url,type:a.type},e,r)})})}function Di(e,t,n,r,i=``){let a=pn(r?.contentSummary),o=(r?.groups||[]).map(wi).join(``);e.innerHTML=`
    <header class="kml-content-header">
      <div>
        <span class="kml-content-kicker">${X(t?.isPublic?`公共点位`:`个人点位`)}</span>
        <h2>${X(n?.name||`未命名点位`)}</h2>
        ${a?`<p>${X(a)}</p>`:``}
      </div>
      <button type="button" class="kml-content-close" data-kml-content-close aria-label="关闭">×</button>
    </header>
    <div class="kml-content-body">
      ${_i(t,n)}
      ${i?`<div class="kml-content-error">${X(i)}</div>`:``}
      ${o||`<div class="kml-content-empty">暂无可展示的富媒体内容</div>`}
      ${r?.sourceSummary?.truncated?`<div class="kml-content-muted">内容较多，仅展示前 50 个链接。</div>`:``}
    </div>
  `,e.querySelector(`[data-kml-content-close]`)?.addEventListener(`click`,hi),Ti(e),Ei(e,t,n,r)}async function Oi(e,t){let n=mi();n.hidden=!1,n.innerHTML=`
    <header class="kml-content-header">
      <div>
        <span class="kml-content-kicker">${X(e?.isPublic?`公共点位`:`个人点位`)}</span>
        <h2>${X(t?.name||`未命名点位`)}</h2>
      </div>
      <button type="button" class="kml-content-close" data-kml-content-close aria-label="关闭">×</button>
    </header>
    <div class="kml-content-body">
      <div class="kml-content-loading">正在加载点位内容...</div>
    </div>
  `,n.querySelector(`[data-kml-content-close]`)?.addEventListener(`click`,hi);try{Di(n,e,t,await gi(e,t))}catch(r){if(r.name===`AbortError`)return;Di(n,e,t,ii(t),r.message||`点位内容加载失败，已展示本地解析结果。`)}}var ki={image:`包含图片`,video:`包含视频`,audio:`包含音频`,iframe:`包含页面`,link:`包含链接`},Ai={image:`#0f766e`,video:`#dc2626`,audio:`#7c3aed`,iframe:`#2563eb`,link:`#475569`},ji={image:`<rect x="8" y="8" width="16" height="13" rx="2"/><circle cx="13" cy="12.5" r="1.5"/><path d="m9.5 19 4.5-4 3 2.5 2-2 3.5 3.5"/>`,video:`<rect x="8" y="8" width="16" height="13" rx="2"/><path d="m14 12 5 3-5 3z"/>`,audio:`<path d="M9 14h3l4-4v10l-4-4H9z"/><path d="M19 12.5a4 4 0 0 1 0 5M21 10a7 7 0 0 1 0 10"/>`,iframe:`<rect x="8" y="8" width="16" height="13" rx="2"/><path d="M8 12h16M11 10h.01M14 10h.01"/>`,link:`<path d="M13.5 17.5 12 19a3 3 0 0 1-4.2-4.2l2.5-2.5a3 3 0 0 1 4.2 0M18.5 12.5 20 11a3 3 0 0 1 4.2 4.2l-2.5 2.5a3 3 0 0 1-4.2 0M12.5 15.5h7"/>`};function Mi(e){let t=Ai[e],n=ji[e];return!t||!n?``:`<svg viewBox="0 0 32 40" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path class="kml-media-marker-pin" fill="${t}" d="M16 1C7.9 1 3 6.7 3 14.1 3 24.2 16 38.5 16 38.5S29 24.2 29 14.1C29 6.7 24.1 1 16 1Z"/><path fill="none" stroke="rgba(255,255,255,.9)" stroke-width="1.2" d="M16 2.5C8.9 2.5 4.5 7.4 4.5 14.1c0 8.1 9.2 19.5 11.5 22.3 2.3-2.8 11.5-14.2 11.5-22.3C27.5 7.4 23.1 2.5 16 2.5Z"/><g fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${n}</g></svg>`}function Ni(e){let t=_n(e);return ki[t]?{type:t,label:ki[t],html:`<span class="kml-media-marker kml-media-marker-${t}" role="img" aria-label="${ki[t]}">${Mi(t)}</span>`,iconSize:[32,40],iconAnchor:[16,39],popupAnchor:[0,-36]}:null}function Pi(e){let t=Ni(e);if(!t)return null;let n=Mi(t.type);return{...t,image:`data:image/svg+xml;charset=utf-8,${encodeURIComponent(n)}`}}function Fi(e){let t=Ni(e);return t?`<svg class="svg-icon kml-media-list-icon kml-media-list-icon-${t.type}" viewBox="0 0 32 30" role="img" aria-label="${t.label}" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ji[t.type]}</g></svg>`:``}var Ii=`data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA`,Li=`/location-keepalive.mp4`;function Ri(e,t){return Object.prototype.hasOwnProperty.call(e,t)?e[t]:globalThis?.[t]}function zi(){}function Bi(e={}){let t=Ri(e,`navigator`),n=Ri(e,`document`),r=Ri(e,`Audio`),i=Ri(e,`logger`)||globalThis.console,a=!1,o=0,s=!1,c=null,l=zi,u=null,d=null,f={element:null,playPromise:null,playing:!1},p={element:null,playPromise:null,playing:!1,attached:!1};function m(e,t){try{i?.warn?.(`[LocationKeepAlive] ${e}`,t)}catch{}}function h(){return n?typeof n.visibilityState==`string`?n.visibilityState===`visible`:typeof n.hidden==`boolean`?!n.hidden:!0:!0}function g(e,t,{muted:n=!1}={}){if(!e)return null;try{e.src=t,e.loop=!0,e.setAttribute?.(`playsinline`,``),n&&(e.muted=!0,e.setAttribute?.(`muted`,``))}catch(e){m(`初始化媒体保活资源失败`,e)}return e}function _(){if(f.element)return f.element;try{typeof r==`function`?f.element=g(new r(Ii),Ii):typeof n?.createElement==`function`&&(f.element=g(n.createElement(`audio`),Ii))}catch(e){m(`创建音频保活资源失败`,e)}return f.element}function ee(){let e=p.element;if(!(!e||p.attached||!n?.body?.appendChild))try{n.body.appendChild(e),p.attached=!0}catch(e){m(`挂载视频保活资源失败`,e)}}function te(){if(!p.element){if(typeof n?.createElement!=`function`)return null;try{let e=g(n.createElement(`video`),Li,{muted:!0});e&&(e.referrerPolicy=`no-referrer`,e.setAttribute?.(`referrerpolicy`,`no-referrer`)),e?.style&&(e.style.position=`absolute`,e.style.width=`1px`,e.style.height=`1px`,e.style.opacity=`0.01`,e.style.pointerEvents=`none`),p.element=e}catch(e){m(`创建视频保活资源失败`,e)}}return ee(),p.element}function v(e){if(e.playing=!1,e.element)try{e.element.pause?.()}catch(e){m(`暂停媒体保活资源失败`,e)}}function ne(e,t,n){if(!a)return Promise.resolve(!1);let r=t();if(!r||typeof r.play!=`function`)return Promise.resolve(!1);if(e.playing&&r.paused!==!0)return Promise.resolve(!0);if(e.playPromise)return e.playPromise;let i;try{i=r.play()}catch(e){return m(`${n}保活播放失败`,e),Promise.resolve(!1)}let o=Promise.resolve(i).then(()=>a?(e.playing=!0,!0):(v(e),!1)).catch(t=>(e.playing=!1,m(`${n}保活播放失败`,t),!1)).finally(()=>{e.playPromise===o&&(e.playPromise=null)});return e.playPromise=o,o}function re(){return ne(f,_,`音频`)}function y(){return ne(p,te,`视频`)}function b(){l(),l=zi}function x(e,t){b();let n=()=>{c===e&&(c=null,b(),a&&o===t&&h()&&(u?.generation===t?d=t:T()))};if(typeof e?.addEventListener==`function`){e.addEventListener(`release`,n,{once:!0}),l=()=>{try{e.removeEventListener?.(`release`,n)}catch{}},e.released===!0&&n();return}if(e&&`onrelease`in e){let t=e.onrelease;e.onrelease=function(...e){try{t?.apply(this,e)}finally{n()}},l=()=>{e.onrelease!==t&&(e.onrelease=t||null)},e.released===!0&&n()}}async function S(e){if(!(!e||e.released===!0||typeof e.release!=`function`))try{await e.release()}catch(e){m(`释放 Screen Wake Lock 失败`,e)}}function ie(e){if(!a||o!==e||!h())return Promise.resolve(null);if(c?.released!==!0){if(c)return v(p),Promise.resolve(c)}else c=null,b();if(u?.generation===e)return u.promise;let n=t?.wakeLock;if(typeof n?.request!=`function`)return y().then(()=>null);let r=Promise.resolve().then(()=>n.request(`screen`)).then(async t=>t?!a||o!==e||!h()?(await S(t),null):t.released===!0?(await y(),null):c&&c!==t&&c.released!==!0?(await S(t),c):(c=t,x(t,e),v(p),c===t?t:null):(a&&o===e&&h()&&await y(),null)).catch(async t=>(a&&o===e&&h()&&(m(`申请 Screen Wake Lock 失败，启用视频降级保活`,t),await y()),null)).finally(()=>{u?.promise===r&&(u=null),d===e&&(d=null,a&&o===e&&h()&&T())});return u={generation:e,promise:r},r}function C(){a&&h()&&T()}function ae(){if(!(s||typeof n?.addEventListener!=`function`))try{n.addEventListener(`visibilitychange`,C),s=!0}catch(e){m(`监听页面可见性变化失败`,e)}}function w(){if(s){try{n?.removeEventListener?.(`visibilitychange`,C)}catch{}s=!1}}async function T(){if(!a)return!1;ae();let e=o,t=await Promise.allSettled([re(),ie(e)]);return a&&o===e&&t.length===2}function E(){return a||(a=!0,o+=1,ae()),T()}function oe(){a=!1,o+=1,d=null,w();let e=c;c=null,b(),v(f),v(p),S(e)}return{start:E,stop:oe,refresh:T,startLocationKeepAlive:E,stopLocationKeepAlive:oe,refreshLocationKeepAlive:T}}var Vi=null;function Hi(){return Vi||=Bi(),Vi}function Ui(){return Hi().start()}function Wi(){return Hi().stop()}var Gi=`/api/v1`,Ki=`mapServiceAdminToken`;function qi(){return window.localStorage.getItem(Ki)||``}function Ji(e){e?window.localStorage.setItem(Ki,e):window.localStorage.removeItem(Ki)}async function Z(e,t={}){let n={Accept:`application/json`,...t.headers||{}};if(t.body!==void 0&&(typeof window<`u`&&t.body instanceof window.FormData||(n[`Content-Type`]=`application/json`)),t.auth!==!1){let e=qi();e&&(n.Authorization=`Bearer ${e}`)}let r=await window.fetch(`${Gi}${e}`,{method:t.method||`GET`,headers:n,body:t.body===void 0?void 0:typeof window<`u`&&t.body instanceof window.FormData?t.body:JSON.stringify(t.body)}),i=await r.json().catch(()=>null);if(!r.ok||i?.code!==0){let e=i?.error?.message||r.statusText||`请求失败`,t=Error(e);throw t.status=r.status,t}return i.result}async function Yi(e){let t=await Z(`/admin/auth/login`,{method:`POST`,auth:!1,body:e});return Ji(t.token),t}function Xi(){Ji(``)}var Zi={session:()=>Z(`/admin/session`),system:()=>Z(`/admin/system`),cache:()=>Z(`/admin/cache`),clearCache:(e={})=>{let t=new URLSearchParams(e).toString();return Z(`/admin/cache${t?`?${t}`:``}`,{method:`DELETE`})},visits:()=>Z(`/admin/visits`),settings:()=>Z(`/admin/settings`),updateSettings:e=>Z(`/admin/settings`,{method:`PUT`,body:e}),updatePassword:e=>Z(`/admin/auth/password`,{method:`POST`,body:e}),precacheCatalog:()=>Z(`/admin/precache/catalog`),tasks:()=>Z(`/admin/precache/tasks`),estimateTask:e=>Z(`/admin/precache/estimate`,{method:`POST`,body:e}),createTask:e=>Z(`/admin/precache/tasks`,{method:`POST`,body:e}),pauseTask:e=>Z(`/admin/precache/tasks/${encodeURIComponent(e)}/pause`,{method:`POST`}),resumeTask:e=>Z(`/admin/precache/tasks/${encodeURIComponent(e)}/resume`,{method:`POST`}),deleteTask:(e,t={})=>{let n=new URLSearchParams;t.deleteCache&&n.set(`deleteCache`,`true`);let r=n.toString();return Z(`/admin/precache/tasks/${encodeURIComponent(e)}${r?`?${r}`:``}`,{method:`DELETE`})},kmls:()=>Z(`/admin/kml`),getKml:e=>Z(`/admin/kml/${encodeURIComponent(e)}`),createKml:e=>Z(`/admin/kml`,{method:`POST`,body:e}),updateKml:(e,t)=>Z(`/admin/kml/${encodeURIComponent(e)}`,{method:`PUT`,body:t}),deleteKml:e=>Z(`/admin/kml/${encodeURIComponent(e)}`,{method:`DELETE`}),importKml:e=>Z(`/admin/kml/import`,{method:`POST`,body:e}),listTileSources:()=>Z(`/admin/tile-sources`),createTileSource:e=>Z(`/admin/tile-sources`,{method:`POST`,body:e}),getTileSource:e=>Z(`/admin/tile-sources/${encodeURIComponent(e)}`),updateTileSource:(e,t)=>Z(`/admin/tile-sources/${encodeURIComponent(e)}`,{method:`PUT`,body:t}),deleteTileSource:e=>Z(`/admin/tile-sources/${encodeURIComponent(e)}`,{method:`DELETE`}),testTileSource:e=>Z(`/admin/tile-sources/${encodeURIComponent(e)}/test`,{method:`POST`}),listSourcePresets:()=>Z(`/admin/source-presets`),createSourceFromPreset:(e,t)=>Z(`/admin/source-presets/${encodeURIComponent(e)}/create-source`,{method:`POST`,body:t}),listKeyPools:()=>Z(`/admin/key-pools`),getKeyPool:e=>Z(`/admin/key-pools/${encodeURIComponent(e)}`),createKeyPool:e=>Z(`/admin/key-pools`,{method:`POST`,body:e}),updateKeyPool:(e,t)=>Z(`/admin/key-pools/${encodeURIComponent(e)}`,{method:`PUT`,body:t}),deleteKeyPool:e=>Z(`/admin/key-pools/${encodeURIComponent(e)}`,{method:`DELETE`}),testKeyPool:e=>Z(`/admin/key-pools/${encodeURIComponent(e)}/test`,{method:`POST`}),testKeyPoolKey:(e,t)=>Z(`/admin/key-pools/${encodeURIComponent(e)}/keys/${encodeURIComponent(t)}/test`,{method:`POST`}),listMapLayers:()=>Z(`/admin/map-layers`),createMapLayer:e=>Z(`/admin/map-layers`,{method:`POST`,body:e}),updateMapLayer:(e,t)=>Z(`/admin/map-layers/${encodeURIComponent(e)}`,{method:`PUT`,body:t}),deleteMapLayer:e=>Z(`/admin/map-layers/${encodeURIComponent(e)}`,{method:`DELETE`}),setDefaultMapLayer:e=>Z(`/admin/map-layers-default`,{method:`PUT`,body:{id:e}}),listProxyOutbounds:()=>Z(`/admin/proxy-outbounds`),createProxyOutbound:e=>Z(`/admin/proxy-outbounds`,{method:`POST`,body:e}),updateProxyOutbound:(e,t)=>Z(`/admin/proxy-outbounds/${encodeURIComponent(e)}`,{method:`PUT`,body:t}),deleteProxyOutbound:e=>Z(`/admin/proxy-outbounds/${encodeURIComponent(e)}`,{method:`DELETE`}),testProxyOutbound:e=>Z(`/admin/proxy-outbounds/${encodeURIComponent(e)}/test`,{method:`POST`}),listProxyPools:()=>Z(`/admin/proxy-pools`),createProxyPool:e=>Z(`/admin/proxy-pools`,{method:`POST`,body:e}),updateProxyPool:(e,t)=>Z(`/admin/proxy-pools/${encodeURIComponent(e)}`,{method:`PUT`,body:t}),deleteProxyPool:e=>Z(`/admin/proxy-pools/${encodeURIComponent(e)}`,{method:`DELETE`}),testProxyPool:e=>Z(`/admin/proxy-pools/${encodeURIComponent(e)}/test`,{method:`POST`}),listExternalPublishes:()=>Z(`/admin/external-publishes`),createExternalPublish:e=>Z(`/admin/external-publishes`,{method:`POST`,body:e}),updateExternalPublish:(e,t)=>Z(`/admin/external-publishes/${encodeURIComponent(e)}`,{method:`PUT`,body:t}),deleteExternalPublish:e=>Z(`/admin/external-publishes/${encodeURIComponent(e)}`,{method:`DELETE`}),resetExternalPublishToken:e=>Z(`/admin/external-publishes/${encodeURIComponent(e)}/token`,{method:`POST`}),testExternalPublish:e=>Z(`/admin/external-publishes/${encodeURIComponent(e)}/test`,{method:`POST`}),listExternalPublishLogs:(e=``)=>Z(e?`/admin/external-publishes/${encodeURIComponent(e)}/logs`:`/admin/external-publish-logs`),listSourceAccessLogs:(e=``)=>Z(e?`/admin/tile-sources/${encodeURIComponent(e)}/access-logs`:`/admin/source-access-logs`)};async function Qi(){return Z(`/access/status`,{auth:!1})}async function $i(e){return Z(`/access/verify`,{method:`POST`,auth:!1,body:{password:e}})}function ea(e=0){if(!e)return`0 B`;let t=[`B`,`KB`,`MB`,`GB`],n=e,r=0;for(;n>=1024&&r<t.length-1;)n/=1024,r+=1;return`${n.toFixed(r===0?0:1)} ${t[r]}`}function ta(e=0){let t=Math.floor(e),n=Math.floor(t/3600),r=Math.floor(t%3600/60),i=t%60;return n?`${n}h ${r}m`:r?`${r}m ${i}s`:`${i}s`}function na(e){return e?new Date(e).toLocaleString():`-`}function Q(e){return String(e??``).replaceAll(`&`,`&amp;`).replaceAll(`<`,`&lt;`).replaceAll(`>`,`&gt;`).replaceAll(`"`,`&quot;`).replaceAll(`'`,`&#39;`)}function ra(e,t){return`${e}?url=${encodeURIComponent(t).replace(/%7B/g,`{`).replace(/%7D/g,`}`)}`}function ia(e){let t=e.system,n=e.visits||{},r=t?.package?.version||`-`,i=e.visitsError||(e.visitsLoading?`统计中`:``);return`
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
          <div><dt>运行</dt><dd>${ta(t?.uptime||0)}</dd></div>
          <div><dt>环境</dt><dd>${Q(t?.env||`-`)}</dd></div>
          <div><dt>时间</dt><dd>${na(t?.serverTime)}</dd></div>
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
  `}function aa(e){let t=e.cache||{},n=e.cacheError||(e.cacheLoading?`统计中`:``),r=t.bySource||{},i=e.tileSources||[];return`
    <section class="admin-panel">
      <div class="admin-panel-head">
        <h2>缓存治理</h2>
        <button type="button" class="btn-danger" data-admin-action="clear-cache">清空全部缓存</button>
      </div>
      
      <dl class="admin-metrics admin-metrics-five">
        <div class="metric-files"><dt>文件数</dt><dd>${Q(n||t.files||0)}</dd></div>
        <div class="metric-size"><dt>总大小</dt><dd>${ea(t.bytes||0)}</dd></div>
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
                  <td>${ea(t.size||0)}</td>
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
  `}async function oa({api:e,event:t,renderDashboard:n,setNotice:r,showConfirm:i,state:a}){let o=t.target.closest(`[data-admin-action]`);if(!o)return!1;let s=o.getAttribute(`data-admin-action`);if(s===`clear-cache`){if(!await i(`清空所有瓦片缓存？此操作不可逆！`))return!0;try{await e.clearCache(),a.cache=await e.cache(),r(`所有瓦片缓存已清空`),n()}catch(e){r(``,e.message),n()}return!0}if(s===`clear-source-cache`){let t=o.getAttribute(`data-source-id`);if(!t)return!1;let s=(a.tileSources||[]).find(e=>e.id===t),c=s?s.name:t;if(!await i(`确定要清空图源【${c}】的全部瓦片缓存吗？`))return!0;try{await e.clearCache({sourceId:t}),a.cache=await e.cache(),r(`已清空图源【${c}】的专属瓦片缓存`),n()}catch(e){r(``,e.message),n()}return!0}return!1}var sa={queued:`排队中`,running:`执行中`,pausing:`暂停中`,paused:`已暂停`,completed:`已完成`,completed_with_errors:`完成有错误`,failed:`失败`,interrupted:`已中断`,deleting:`删除中`},ca=1e3,la=1500,ua=new Set([`queued`,`running`,`pausing`,`deleting`]),da=null,fa=0,pa=``,ma=``,ha=null,ga=0;function _a(e){return sa[e]||e}var va={queued:`⏳`,running:`⚙`,pausing:`⏸`,paused:`⏸`,completed:`✓`,completed_with_errors:`⚠`,failed:`✗`,interrupted:`⏹`,deleting:`🗑`};function ya(e){return va[e]||`•`}function ba(e,t){let n=t[0],r=e.precacheForm||{};return{providerId:t.some(e=>e.id===r.providerId)?r.providerId:n?.id||``,bounds:{west:Number(r.bounds?.west??113.24),south:Number(r.bounds?.south??23.11),east:Number(r.bounds?.east??113.29),north:Number(r.bounds?.north??23.15)},minZoom:Number(r.minZoom??12),maxZoom:Number(r.maxZoom??12),concurrency:Number(r.concurrency??4),requestIntervalMs:Number(r.requestIntervalMs??0),refresh:!!r.refresh}}function xa(e,t){return e.find(e=>e.id===t.providerId)||e[0]||null}function Sa(e){let t=e.expandedTaskIds||new Set;return(e.tasks||[]).map(e=>({...e,expanded:t.has(e.id)}))}function Ca(e=[]){return e.some(e=>ua.has(e.status))}function wa(e){let t=e.precacheCatalog||[],n=ba(e,t),r=xa(t,n),i=Sa(e);return`
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
          ${Ta(e)}
          <button type="submit">创建任务</button>
        </form>
      </section>
      ${ka(i)}
    </div>
  `}function Ta(e){let t=e.precacheEstimate;return e.precacheEstimateStatus===`loading`?`<div class="admin-estimate" data-precache-estimate><p>正在估算瓦片数量和下载体积</p></div>`:e.precacheEstimateError?`<div class="admin-estimate is-error" data-precache-estimate><p>${Q(e.precacheEstimateError)}</p></div>`:t?`
    <div class="admin-estimate ${t.withinLimit?``:`is-warning`}" data-precache-estimate>
      <dl class="admin-metrics">
        <div><dt>预计文件</dt><dd>${Q(t.total||0)}</dd></div>
        <div><dt>估算体积</dt><dd>${ea(t.estimatedBytesRange?.min||0)} - ${ea(t.estimatedBytesRange?.max||0)}</dd></div>
        <div><dt>建议上限</dt><dd>${Q(t.maxTiles||0)}</dd></div>
        <div><dt>建议</dt><dd>${t.withinLimit?`可以创建`:`任务较大，建议设置请求间隔`}</dd></div>
      </dl>
      <p>${Oa(t)}</p>
    </div>
  `:`<div class="admin-estimate" data-precache-estimate><p>停止移动地图后会自动估算任务规模</p></div>`}function Ea(e){let t=e.root?.querySelector(`[data-precache-estimate]`);t&&(t.outerHTML=Ta(e))}function Da(e){return e.length?e.map(e=>`Z${e.z}: ${e.count}`).join(`，`):`暂无分级明细`}function Oa(e){if(e.targetType===`layer`){let t=e.sources||[];return t.length?t.map(e=>`${e.sourceName||e.sourceId}: ${e.total||0} 张，约 ${ea(e.estimatedBytes||0)}`).join(`，`):`暂无可预缓存图源明细`}return Da(e.ranges||[])}function ka(e){return`
    <section class="admin-panel admin-panel-wide admin-precache-task-panel" data-precache-task-panel>
      <div class="admin-panel-head">
        <h2>任务</h2>
        <span class="admin-badge">${e.length}</span>
      </div>
      <div class="admin-task-list">
        ${e.slice(0,10).map(e=>Aa(e)).join(``)||`<p class="admin-empty">暂无任务</p>`}
      </div>
    </section>
  `}function Aa(e){let t=e.expanded;return`
    <article class="admin-task-card">
      <div class="admin-task-main">
        <div class="admin-task-title">
          <span class="admin-status admin-status-${e.status}" title="${Q(_a(e.status))}">${Q(ya(e.status))}</span>
          <strong>${Q(e.providerId)}</strong>
          <small>${na(e.updatedAt)}</small>
        </div>
        ${ja(e)}
      </div>
      <dl class="admin-task-summary">
        <div><dt>体积</dt><dd>${ea(e.bytes||0)}</dd></div>
        <div><dt>级别</dt><dd>${Q(e.minZoom)}-${Q(e.maxZoom)}</dd></div>
        <div><dt>并发</dt><dd>${Q(e.concurrency||0)}</dd></div>
        <div><dt>间隔</dt><dd>${Q(e.requestIntervalMs||0)}ms</dd></div>
      </dl>
      ${Ma(e)}
      ${t?Na(e):``}
    </article>
  `}function ja(e){let t=Number(e.completed||0),n=Number(e.total||0),r=n?Math.min(100,Math.round(t/n*100)):0;return`
    <div class="admin-task-progress">
      <span>${Q(t)} / ${Q(n)} (${r}%)</span>
      <small>成功 ${Q(e.succeeded||0)}，失败 ${Q(e.failed||0)}</small>
    </div>
  `}function Ma(e){let t=[`queued`,`running`].includes(e.status),n=[`paused`,`interrupted`,`failed`,`completed_with_errors`].includes(e.status),r=e.status!==`deleting`,i=e.expanded?`收起`:`详情`;return`
    <div class="admin-task-actions">
      ${t?`<button type="button" data-precache-task-action="pause" data-task-id="${Q(e.id)}">暂停</button>`:``}
      ${n?`<button type="button" data-precache-task-action="resume" data-task-id="${Q(e.id)}">继续/重试</button>`:``}
      <button type="button" data-precache-task-action="edit" data-task-id="${Q(e.id)}">编辑</button>
      <button type="button" data-precache-task-action="update" data-task-id="${Q(e.id)}">更新</button>
      ${r?`<button type="button" data-precache-task-action="preview" data-task-id="${Q(e.id)}">预览</button>`:``}
      <button type="button" data-precache-task-action="toggle-details" data-task-id="${Q(e.id)}">${i}</button>
      <button type="button" class="danger" data-precache-task-action="delete" data-task-id="${Q(e.id)}">删除</button>
    </div>
  `}function Na(e){let t=e.bounds||{},n=e.ranges||[],r=e.errors||[],i=Object.values(e.failedTiles||{});return`
    <div class="admin-task-details">
      <dl>
        <div><dt>区域</dt><dd>西 ${Q(t.west)} / 南 ${Q(t.south)} / 东 ${Q(t.east)} / 北 ${Q(t.north)}</dd></div>
        <div><dt>级别明细</dt><dd>${Da(n)}</dd></div>
        <div><dt>失败待重试</dt><dd>${Q(i.length)}</dd></div>
        <div><dt>创建时间</dt><dd>${na(e.createdAt)}</dd></div>
        <div><dt>完成时间</dt><dd>${na(e.finishedAt)}</dd></div>
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
  `}function Pa(e,t){Qa(e,t);let n=t.elements.providerId,r=n.options[n.selectedIndex]?.getAttribute(`data-type`)||`source`,i=n.value;return{targetType:r,targetId:i,providerId:i,bounds:{west:Number(t.elements.west.value),south:Number(t.elements.south.value),east:Number(t.elements.east.value),north:Number(t.elements.north.value)},minZoom:Number(t.elements.minZoom.value),maxZoom:Number(t.elements.maxZoom.value),concurrency:Number(t.elements.concurrency.value),requestIntervalMs:Number(t.elements.requestIntervalMs.value),refresh:t.elements.refresh.checked}}function Fa(e,t){e.tasks=e.tasks.map(e=>e.id===t.id?t:e)}function Ia(e,t){e.tasks=e.tasks.filter(e=>e.id!==t)}function La(e){let t=e.root?.querySelector(`[data-precache-task-panel]`);t&&(t.outerHTML=ka(Sa(e)))}function Ra(e){return Array.isArray(e)?`[${e.map(Ra).join(`,`)}]`:e&&typeof e==`object`?`{${Object.keys(e).sort().map(t=>`${JSON.stringify(t)}:${Ra(e[t])}`).join(`,`)}}`:JSON.stringify(e)}function za(e){fa+=1,pa=``,e.precacheEstimate=null,e.precacheEstimateStatus=``,e.precacheEstimateError=``,Ea(e)}function Ba(e,t,n=ca){e.activeTab===`precache`&&(window.clearTimeout(da),da=window.setTimeout(()=>{Va(e,t)},n))}async function Va(e,t){if(e.activeTab!==`precache`)return;let n=e.root?.querySelector(`[data-precache-form]`);if(!n)return;let r=Pa(e,n),i=Ra(r);if(i===ma||i===pa)return;let a=fa+1;fa=a,pa=i,e.precacheEstimateStatus=`loading`,e.precacheEstimateError=``,Ea(e);try{let n=await t.estimateTask(r);if(a!==fa)return;e.precacheEstimate=n,e.precacheEstimateStatus=``,e.precacheEstimateError=``,ma=i,pa=``,Ea(e)}catch(t){if(a!==fa)return;e.precacheEstimate=null,e.precacheEstimateStatus=``,e.precacheEstimateError=t.message,pa=``,Ea(e)}}function Ha(e,t,n=la){window.clearTimeout(ha),!(e.activeTab!==`precache`||!Ca(e.tasks))&&(ha=window.setTimeout(()=>{Ua(e,t)},n))}async function Ua(e,t){if(e.activeTab!==`precache`)return;let n=ga+1;ga=n;try{let r=await t.tasks();if(n!==ga||e.activeTab!==`precache`)return;e.tasks=r,La(e),Ha(e,t)}catch(n){console.warn(`预缓存任务状态刷新失败`,n),Ha(e,t,la*2)}}async function Wa({api:e,event:t,renderDashboard:n,setNotice:r,state:i}){let a=t.target.closest(`[data-precache-form]`),o=t.target.closest(`[data-place-search-form]`);if(a)return t.preventDefault(),e.createTask(Pa(i,a)).then(t=>{Array.isArray(t)?(i.tasks=[...t,...i.tasks],r(`成功创建了 ${t.length} 个图源缓存子任务`)):(i.tasks=[t,...i.tasks],r(`预缓存任务已创建`)),n(),Ha(i,e,300)}).catch(e=>{r(``,e.message),n()}),!0;if(o){t.preventDefault();let e=o.elements.keyword.value.trim();return e&&await ro(i,e),!0}return!1}async function Ga({api:e,event:t,renderDashboard:n,setNotice:r,showCheckboxConfirm:i,showConfirm:a,state:o}){let s=t.target.closest(`[data-precache-task-action]`);if(s)return await qa({actionTarget:s,api:e,renderDashboard:n,setNotice:r,showCheckboxConfirm:i,showConfirm:a,state:o}),!0;let c=t.target.closest(`[data-place-lng][data-place-lat]`);return c?(to(o,Number(c.getAttribute(`data-place-lng`)),Number(c.getAttribute(`data-place-lat`))),!0):t.target.closest(`[data-admin-action]`)?.getAttribute(`data-admin-action`)===`sync-bounds`?(Za(o),za(o),Ba(o,e),!0):!1}async function Ka({api:e,event:t,state:n}){let r=t.target.closest(`[data-precache-form]`);return r?(Qa(n,r),za(n),Ba(n,e),!0):!1}async function qa({actionTarget:e,api:t,renderDashboard:n,setNotice:r,showCheckboxConfirm:i,showConfirm:a,state:o}){let s=e.getAttribute(`data-precache-task-action`),c=e.getAttribute(`data-task-id`),l=o.tasks.find(e=>e.id===c);if(!(!s||!c))try{if(s===`pause`){Fa(o,await t.pauseTask(c)),r(`预缓存任务已暂停`),n(),Ha(o,t,300);return}if(s===`resume`){Fa(o,await t.resumeTask(c)),r(`预缓存任务已继续`),n(),Ha(o,t,300);return}if(s===`delete`){let e=!1;if(i instanceof Function){let t=await i(`删除此预缓存任务？执行中的任务会停止并从列表移除。`,{confirmText:`删除`,checkboxLabel:`同时删除该任务范围内已缓存的瓦片文件`});if(!t?.confirmed)return;e=!!t.checked}else if(!await a(`删除此预缓存任务？执行中的任务会停止并从列表移除。`))return;await t.deleteTask(c,{deleteCache:e}),Ia(o,c),r(e?`预缓存任务已删除，关联缓存文件清理已提交`:`预缓存任务已删除`),n();return}if(s===`edit`&&l){eo(o,l),za(o),Ba(o,t),r(`任务参数已回填，可调整后创建新任务`),n();return}if(s===`update`&&l){o.tasks=[await t.createTask({providerId:l.providerId,bounds:l.bounds,minZoom:l.minZoom,maxZoom:l.maxZoom,concurrency:l.concurrency,requestIntervalMs:l.requestIntervalMs||0,refresh:!1}),...o.tasks],r(`更新任务已创建，将跳过新鲜缓存并补齐缺失瓦片`),n(),Ha(o,t,300);return}if(s===`toggle-details`){o.expandedTaskIds.has(c)?o.expandedTaskIds.delete(c):o.expandedTaskIds.add(c),n();return}s===`preview`&&l&&(window.location.href=$a(l))}catch(e){r(``,e.message),n(),Ha(o,t,300)}}async function Ja(e){return e.AMap?e.AMap:(window._AMapSecurityConfig={securityJsCode:_.securityJsCode},e.amapLoader?(e.AMap=await e.amapLoader.load({key:_.key,version:`2.0`,plugins:_.plugins}).catch(e=>(console.warn(`高德 JSAPI 加载失败，后台地点搜索不可用`,e),null)),e.AMap):(console.warn(`高德 JSAPI Loader 未初始化，后台地点搜索不可用`),null))}function Ya(e){let t=e.root.querySelector(`[data-precache-form]`);return{west:Number(t?.elements.west.value),south:Number(t?.elements.south.value),east:Number(t?.elements.east.value),north:Number(t?.elements.north.value)}}function Xa(e,t){let n=e.root.querySelector(`[data-precache-form]`);n&&(n.elements.west.value=t.getWest().toFixed(6),n.elements.south.value=t.getSouth().toFixed(6),n.elements.east.value=t.getEast().toFixed(6),n.elements.north.value=t.getNorth().toFixed(6),Qa(e,n))}function Za(e){if(!e.map||!e.rectangle)return;let t=e.map.getBounds();e.rectangle.setBounds(t),Xa(e,t)}function Qa(e,t){return t?(e.precacheForm={providerId:t.elements.providerId.value,bounds:{west:Number(t.elements.west.value),south:Number(t.elements.south.value),east:Number(t.elements.east.value),north:Number(t.elements.north.value)},minZoom:Number(t.elements.minZoom.value),maxZoom:Number(t.elements.maxZoom.value),concurrency:Number(t.elements.concurrency.value),requestIntervalMs:Number(t.elements.requestIntervalMs.value),refresh:t.elements.refresh.checked},e.precacheForm):null}function $a(e){let t=e.bounds||{},n=(Number(t.south)+Number(t.north))/2,r=(Number(t.west)+Number(t.east))/2,i=Number(e.maxZoom||e.minZoom||ee.zoom);if(!Number.isFinite(n)||!Number.isFinite(r))return`/`;let a=[n.toFixed(6),r.toFixed(6),Math.max(3,Math.min(20,i)),0].join(`,`);return`/?coords=${encodeURIComponent(a)}`}function eo(e,t){if(!t)return;let n=t.bounds||{};e.precacheForm={providerId:t.providerId||e.precacheForm?.providerId||``,bounds:{west:Number(n.west),south:Number(n.south),east:Number(n.east),north:Number(n.north)},minZoom:Number(t.minZoom),maxZoom:Number(t.maxZoom),concurrency:Number(t.concurrency||e.precacheForm?.concurrency||4),requestIntervalMs:Number(t.requestIntervalMs||e.precacheForm?.requestIntervalMs||0),refresh:!1}}function to(e,t,n,r=15){e.map&&(e.map.setView([n,t],r),Za(e),e.onPrecacheBoundsChange instanceof Function&&e.onPrecacheBoundsChange())}function no(e,t){Ha(e,t);let n=e.root.querySelector(`#admin-precache-map`);if(!n)return;e.precacheMapHeight&&(n.style.height=`${e.precacheMapHeight}px`),e.onPrecacheBoundsChange=()=>Ba(e,t),document.querySelectorAll(`.amap-sug-result`).forEach(e=>e.remove()),e.map&&(e.map.remove(),e.map=null,e.rectangle=null);let r=p.default.map(n,{center:ee.center,zoom:Math.min(ee.zoom,13),zoomControl:!0,attributionControl:!1});p.default.tileLayer(ra(te,`https://webst01.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}`),{minZoom:3,maxZoom:18,keepBuffer:4}).addTo(r);let i=Ya(e),a=p.default.latLngBounds([i.south,i.west],[i.north,i.east]);e.rectangle=p.default.rectangle(a,{color:`#0f766e`,weight:2,fillColor:`#f59e0b`,fillOpacity:.14}).addTo(r);let o=!1;r.fitBounds(a),r.on(`moveend zoomend`,()=>Za(e)),r.on(`moveend zoomend`,()=>{o&&e.onPrecacheBoundsChange instanceof Function&&e.onPrecacheBoundsChange()}),window.requestAnimationFrame(()=>{o=!0}),e.map=r;let s=e.root.querySelector(`[data-place-search-form] input[name="keyword"]`);s&&(s.id=`admin-precache-search-input`,Ja(e).then(t=>{t&&t.AutoComplete&&new t.AutoComplete({input:`admin-precache-search-input`}).on(`select`,t=>{if(t.poi?.location){let{lng:n,lat:r}=t.poi.location;to(e,n,r)}})}));let c=e.root.querySelector(`.admin-map-resizer`);if(c&&n){let t=0,r=0,i=e=>{t=e.clientY,r=n.offsetHeight,document.addEventListener(`pointermove`,a),document.addEventListener(`pointerup`,o),c.classList.add(`is-dragging`),e.preventDefault()},a=i=>{let a=i.clientY-t,o=Math.min(800,Math.max(150,r+a));n.style.height=`${o}px`,e.precacheMapHeight=o,e.map&&e.map.invalidateSize()},o=()=>{document.removeEventListener(`pointermove`,a),document.removeEventListener(`pointerup`,o),c.classList.remove(`is-dragging`)};c.addEventListener(`pointerdown`,i)}}async function ro(e,t){let n=e.root.querySelector(`[data-place-search-results]`);if(!n)return;let r=await Ja(e);if(!r){n.innerHTML=`<p>高德搜索暂不可用</p>`;return}let i=new r.PlaceSearch({pageSize:8,pageIndex:1});n.innerHTML=`<p>正在搜索</p>`,i.search(t,(e,t)=>{if(e!==`complete`||!t?.poiList?.pois?.length){n.innerHTML=`<p>没有找到匹配地点</p>`;return}n.innerHTML=t.poiList.pois.map(e=>{let t=e.location;return`
        <button type="button" data-place-lng="${t.lng}" data-place-lat="${t.lat}">
          <strong>${Q(e.name)}</strong>
          <span>${Q(e.address||e.district||``)}</span>
        </button>
      `}).join(``)})}var io=4;function ao(e){let t=e.settings?.access||{},n=e.settings?.auth||{},r=n.tokenTtl?Math.round(n.tokenTtl/(1e3*60*60*24)):15;return`
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
            <input name="accessPassword" type="password" autocomplete="new-password" placeholder="${t.hasPassword?`已设置，输入新密码以修改`:`输入至少 ${io} 位访问密码`}">
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
  `}async function oo({api:e,event:t,renderDashboard:n,setNotice:r,state:i}){let a=t.target.closest(`[data-access-form]`),o=t.target.closest(`[data-admin-password-form]`),s=t.target.closest(`[data-auth-settings-form]`);if(a){t.preventDefault();try{let t=a.elements.accessEnabled.checked,o=a.elements.accessPassword.value.trim(),s=a.elements.clearAccessPassword?.checked||!1,c={access:{enabled:t}};if(o){if(o.length<io)return r(``,`访问密码长度至少为 ${io} 位`),n(),!0;c.access.password=o}else if(s)c.access.clearPassword=!0;else if(t&&!i.settings?.access?.hasPassword)return r(``,`启用访问密码时，必须设置访问密码`),n(),!0;if(t&&s&&!o)return r(``,`启用访问密码时不能同时清除密码`),n(),!0;i.settings=await e.updateSettings(c),r(`访问控制已保存`),n()}catch(e){r(``,e.message),n()}return!0}if(s){t.preventDefault();try{let t=Number(s.elements.tokenTtlDays.value);if(isNaN(t)||t<=0)return r(``,`有效时长必须是大于 0 的数字`),n(),!0;let a={auth:{tokenTtl:Math.round(t*24*60*60*1e3)}};i.settings=await e.updateSettings(a),r(`登录态设置已保存`),n()}catch(e){r(``,e.message),n()}return!0}if(o){t.preventDefault();let i=o.elements.currentPassword.value,a=o.elements.newPassword.value,s=o.elements.confirmPassword.value;if(a.length<4)return r(``,`新密码长度至少为 4 位`),n(),!0;if(a!==s)return r(``,`两次输入的新密码不一致`),n(),!0;try{await e.updatePassword({currentPassword:i,newPassword:a}),r(`管理密码修改成功！`),o.reset(),n()}catch(e){r(``,e.message),n()}return!0}return!1}function so(e){let t=e.kmls||[];return`
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
  `}async function co({api:e,event:t,renderDashboard:n,setNotice:r,showConfirm:i,state:a}){let o=t.target.closest(`[data-admin-action]`);if(!o)return!1;let s=o.getAttribute(`data-admin-action`),c=o.getAttribute(`data-kml-id`);if(s===`create-blank-kml`){let t=await Ee({title:`新建公共 KML`,fields:[{name:`name`,label:`图层名称`,type:`text`}],values:{name:`新建公共 KML ${a.kmls.length+1}`}});if(!t||!t.name?.trim())return!0;try{r(`正在创建...`),await e.createKml({name:t.name.trim(),status:`draft`,coordCorrection:`wgs84-to-gcj02`,features:[]}),a.kmls=await e.kmls(),r(`新建成功`),n()}catch(e){r(``,e.message),n()}return!0}if(s===`trigger-import`)return document.getElementById(`admin-kml-file-input`)?.click(),!0;if(s===`set-status`){let t=o.getAttribute(`data-kml-status`);try{r(`正在更新状态...`),await e.updateKml(c,{status:t}),a.kmls=await e.kmls(),r(`状态已更新`),n()}catch(e){r(``,e.message),n()}return!0}if(s===`rename`){let t=o.getAttribute(`data-kml-name`),i=await Ee({title:`重命名公共 KML`,fields:[{name:`name`,label:`图层名称`,type:`text`}],values:{name:t}});if(!i||!i.name?.trim()||i.name.trim()===t)return!0;try{r(`正在重命名...`),await e.updateKml(c,{name:i.name.trim()}),a.kmls=await e.kmls(),r(`重命名成功`),n()}catch(e){r(``,e.message),n()}return!0}if(s===`export`){try{r(`正在获取数据...`);let t=await e.getKml(c);r(``);let n=Rt(t.name,t.features||[]),i=new Blob([n],{type:`application/vnd.google-earth.kml+xml;charset=utf-8`}),a=URL.createObjectURL(i),o=document.createElement(`a`);o.href=a,o.download=`${t.name}.kml`,document.body.appendChild(o),o.click(),document.body.removeChild(o),URL.revokeObjectURL(a)}catch(e){r(``,e.message),n()}return!0}if(s===`delete`){if(!await i(`确认永久删除此公共 KML 图层及其中所有要素？此操作不可撤销。`))return!0;try{r(`正在删除...`),await e.deleteKml(c),a.kmls=await e.kmls(),r(`删除成功`),n()}catch(e){r(``,e.message),n()}return!0}return!1}async function lo({api:e,event:t,renderDashboard:n,setNotice:r,state:i}){let a=t.target;if(a.id===`admin-kml-file-input`){let t=a.files[0];if(!t)return!0;let o=new FormData;o.append(`file`,t),o.append(`name`,t.name),o.append(`status`,`draft`),o.append(`coordCorrection`,`wgs84-to-gcj02`);try{r(`正在导入 KML 文件...`),await e.importKml(o),i.kmls=await e.kmls(),r(`导入成功（默认为草稿状态）`),n()}catch(e){r(``,e.message),n()}finally{a.value=``}return!0}if(a.matches(`[data-admin-action="toggle-correction"]`)){let t=a.getAttribute(`data-kml-id`),o=a.checked?`wgs84-to-gcj02`:`none`;try{r(`正在更新纠偏设置...`),await e.updateKml(t,{coordCorrection:o}),i.kmls=await e.kmls(),r(`纠偏设置已更新`),n()}catch(e){r(``,e.message),n()}return!0}return!1}var uo=216e5,fo=2592e6,po=60*1e3,mo=60*po,ho=24*mo,go={1:256,2:512,3:768},_o=[[`xyz`,`XYZ 栅格`],[`tms`,`TMS 栅格`],[`xyz-raster`,`XYZ 栅格`],[`tms-raster`,`TMS 栅格`],[`wmts-raster`,`WMTS 栅格`],[`arcgis-raster`,`ArcGIS 栅格`],[`quadkey-raster`,`QuadKey 栅格`],[`time-raster`,`时间序列栅格`],[`mvt`,`MVT 矢量瓦片`],[`vector-tilejson`,`矢量 TileJSON`],[`vector-style`,`矢量 Style JSON`],[`pmtiles-vector`,`PMTiles 矢量`],[`pmtiles-raster`,`PMTiles 栅格`],[`google-map-tiles-api`,`Google Map Tiles API`]],vo=[[`satellite`,`卫星`],[`road`,`街道/道路`],[`street`,`街道/道路`],[`label`,`注记`],[`terrain`,`地形`],[`vector`,`矢量`],[`overlay`,`叠加`],[`weather`,`天气`],[`other`,`其他`],[`custom`,`自定义`]],yo=[[`query`,`Query 参数`],[`header`,`请求头`],[`bearer`,`Bearer Token`],[`session`,`会话/适配器`]],bo=[[`round_robin`,`健康 Key 轮询`],[`priority_failover`,`优先级失败切换`],[`random`,`健康 Key 随机`],[`weighted_round_robin`,`按权重轮询`]],xo=[[`global`,`全局`],[`source`,`图源`],[`publish`,`发布项`]],So=[[`leaflet`,`Leaflet 栅格`],[`maplibre`,`MapLibre 矢量`],[`cesium`,`Cesium 3D`]],Co=new Set([`mvt`,`vector-tilejson`,`vector-style`,`pmtiles-vector`]),wo=new Set([`pmtiles-vector`,`pmtiles-raster`]);function To(e){return e?.errorMessage||e?.error||``}function Eo(e,t=``){return e.map(([e,n])=>`<option value="${Q(e)}" ${t===e?`selected`:``}>${Q(n)}</option>`).join(``)}function Do(e,t){return!e||t.some(([t])=>t===e)?``:`<option value="${Q(e)}" selected>${Q(e)}</option>`}function Oo(e=``){return _o.find(([t])=>t===e)?.[1]||e||`-`}function ko(e=``){return Co.has(e)}function Ao(e=``){return wo.has(e)}function jo(e={},t){return e.entry?.[t]||e[t]||``}function Mo(e={}){return e.kind===`vector-style`?jo(e,`styleJsonUrl`):e.kind===`vector-tilejson`?jo(e,`tileJsonUrl`):Ao(e.kind)?jo(e,`pmtilesUrl`):jo(e,`template`)}function No(e,t=`是`,n=`否`){return e?`<span class="badge-green">${Q(t)}</span>`:`<span class="badge-gray">${Q(n)}</span>`}function Po(e=`ready`){return e===`ready`?`<span class="badge-green">可创建</span>`:e===`requires_adapter`?`<span class="badge-blue">需适配器</span>`:e===`research_only`?`<span class="badge-gray">调研参考</span>`:`<span class="badge-gray">${Q(e)}</span>`}function Fo(e=[],t=``){return e.map(e=>`<option value="${Q(e.id)}" ${e.id===t?`selected`:``}>${Q(e.name)} (${Q(e.id)})</option>`).join(``)}function Io(e={},t=[]){return e.requiresKey&&(t.find(t=>(t.allowedPresetIds||[]).includes(e.presetId))||t.find(t=>t.id===`default-${e.vendor}-key-pool`)||t.find(t=>t.vendor===e.vendor&&t.scope===`global`))||null}function Lo(e={},t=`申请 Key`){return e.credentialUrl?`<a href="${Q(e.credentialUrl)}" target="_blank" rel="noopener noreferrer" class="btn-link">${Q(t)}</a>`:``}function Ro(e){return e===`layer`?`组合图层`:e===`dedicated_source`?`专用图源`:`系统图源`}function zo(e){return e.visibility?.scope===`external_only`?`专用发布`:`系统图源`}function Bo(e,t){let n=window.location.origin,r=e.pathSlug,i=e.auth?.mode===`token`?`?token=您的TOKEN`:``,a=`${n}/api/v1/external/${r}/tilejson${i}`,o=`${n}/api/v1/external/${r}/tilejson.json${i}`,s=`${n}/api/v1/external/${r}/style.json${i}`,c=e.targetType===`source`||e.targetType===`dedicated_source`?(t.tileSources||[]).find(t=>t.id===e.targetId):null;if(c&&ko(c.kind)){let t=`${n}/api/v1/external/${r}/tiles/{z}/{x}/{y}.pbf${i}`,a=`${n}/api/v1/external/${r}.pmtiles${i}`,l=c.kind===`vector-style`?s:c.kind===`vector-tilejson`?o:Ao(c.kind)?a:t,u=c.kind===`vector-style`?`const map = new maplibregl.Map({
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
  `}function Vo(e={},t=[],n=[],r=`proxy`){let i=[`fixed`,`pool`].includes(e.mode)?e.mode:`never`;return`
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
  `}function Ho(e,t){let n=Number.isFinite(Number(e))?Math.max(0,Number(e)):t;return{days:Math.floor(n/ho),hours:Math.floor(n%ho/mo),minutes:Math.floor(n%mo/po)}}function Uo(e,t,n,r){let i=Ho(n,r);return`
    <div class="field-group">
      <label>${t}</label>
      <div style="display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap:8px;">
        <input name="${e}_days" type="number" min="0" max="365" value="${i.days}" aria-label="${t}天数">
        <input name="${e}_hours" type="number" min="0" max="23" value="${i.hours}" aria-label="${t}小时数">
        <input name="${e}_minutes" type="number" min="0" max="59" value="${i.minutes}" aria-label="${t}分钟数">
      </div>
      <small style="color:#64748b;">天 / 小时 / 分钟</small>
    </div>
  `}function Wo(e={},t=`cache`){return`
    <div class="checkbox-group">
      <input type="checkbox" id="${t}_enabled" name="${t}_enabled" ${e.enabled===!1?``:`checked`}>
      <label for="${t}_enabled">启用服务端缓存</label>
    </div>
    <div class="form-grid" style="margin-top:10px;">
      ${Uo(`${t}_ttl`,`缓存有效时间`,e.ttlMs,uo)}
      ${Uo(`${t}_staleTtl`,`软过期时间`,e.staleTtlMs,fo)}
    </div>
  `}function Go(e,t,n=`proxy`){return{mode:t.get(`${n}_mode`)||`never`,outboundId:t.get(`${n}_outboundId`)||``,poolId:t.get(`${n}_poolId`)||``,fallbackToDirect:!!e.elements[`${n}_fallbackToDirect`]?.checked}}function Ko(e,t){let n=Math.max(0,parseInt(e.get(`${t}_days`)||`0`,10)||0),r=Math.max(0,parseInt(e.get(`${t}_hours`)||`0`,10)||0),i=Math.max(0,parseInt(e.get(`${t}_minutes`)||`0`,10)||0);return n*ho+r*mo+i*po}function qo(e,t,n=`cache`){return{enabled:!!e.elements[`${n}_enabled`]?.checked,ttlMs:Ko(t,`${n}_ttl`),staleTtlMs:Ko(t,`${n}_staleTtl`)}}function Jo(e,t){return String(e.get(t)||``).split(`,`).map(e=>e.trim()).filter(Boolean)}function Yo(e){return{template:String(e.get(`entry_template`)||``).trim(),styleJsonUrl:String(e.get(`entry_styleJsonUrl`)||``).trim(),tileJsonUrl:String(e.get(`entry_tileJsonUrl`)||``).trim(),pmtilesUrl:String(e.get(`entry_pmtilesUrl`)||``).trim(),glyphsUrl:String(e.get(`entry_glyphsUrl`)||``).trim(),spritesUrl:String(e.get(`entry_spritesUrl`)||``).trim()}}function Xo(e,t){return{required:!!e.elements.secrets_required?.checked,keyPoolId:t.get(`secrets_keyPoolId`)||``,placement:t.get(`secrets_placement`)||`query`,paramName:t.get(`secrets_paramName`)||`key`}}function Zo(e,t){return{engine:t.get(`rendering_engine`)||`leaflet`,clients:[e.elements.rendering_client_2d?.checked?`2d`:``,e.elements.rendering_client_3d?.checked?`3d`:``].filter(Boolean),fallbackRasterSourceId:t.get(`rendering_fallbackRasterSourceId`)||``}}function Qo(e,t){return{attribution:t.get(`license_attribution`)||``,termsUrl:t.get(`license_termsUrl`)||``,officialStatus:t.get(`license_officialStatus`)||`official`,licenseType:t.get(`license_licenseType`)||`unknown`,cacheAllowedByLicense:!!e.elements.license_cacheAllowedByLicense?.checked,publicUseAllowed:!!e.elements.license_publicUseAllowed?.checked,chinaPublicUseReviewed:!!e.elements.license_chinaPublicUseReviewed?.checked,chinaPublicUseRisk:t.get(`license_chinaPublicUseRisk`)||``}}function $o(e,t){let n=Array.from(e.querySelectorAll(`[data-key-row]`)).map(e=>{let t=t=>e.querySelector(`[name="${t}"]`),n={id:t(`key_id`)?.value||``,alias:t(`key_alias`)?.value||``,enabled:!!t(`key_enabled`)?.checked,secretType:t(`key_secretType`)?.value||`api_key`,placement:t(`key_placement`)?.value||`query`,paramName:t(`key_paramName`)?.value||`key`,priority:parseInt(t(`key_priority`)?.value||`100`,10),weight:parseInt(t(`key_weight`)?.value||`1`,10),qpsLimit:parseInt(t(`key_qpsLimit`)?.value||`0`,10),dailyLimit:parseInt(t(`key_dailyLimit`)?.value||`0`,10),monthlyLimit:parseInt(t(`key_monthlyLimit`)?.value||`0`,10)},r=t(`key_secret`)?.value||``;return r&&(n.secret=r),n});return{id:t.get(`id`),name:t.get(`name`),vendor:t.get(`vendor`),enabled:!!e.elements.enabled?.checked,scope:t.get(`scope`)||`global`,strategy:t.get(`strategy`)||`round_robin`,cooldownMs:parseInt(t.get(`cooldownMs`)||`300000`,10),maxRetriesPerRequest:parseInt(t.get(`maxRetriesPerRequest`)||`2`,10),defaultSecretType:t.get(`defaultSecretType`)||`api_key`,defaultPlacement:t.get(`defaultPlacement`)||`query`,defaultParamName:t.get(`defaultParamName`)||`key`,credentialUrl:String(t.get(`credentialUrl`)||``).trim(),allowedPresetIds:Jo(t,`allowedPresetIds`),allowedSourceIds:Jo(t,`allowedSourceIds`),keys:n,description:t.get(`description`)||``}}function es(e,t){if(!e.editingKeyPool||!t)return;let n=e.editingKeyPool.keys||[],r=new Map(n.filter(e=>e.id).map(e=>[e.id,e])),i=$o(t,new FormData(t));i.keys=i.keys.map((e,t)=>({...n[t]||{},...r.get(e.id)||{},...e})),e.editingKeyPool={...e.editingKeyPool,...i}}function ts(e={}){let t=e.entry||{};return`
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
  `}function ns(e={},t=[]){let n=e.secrets||{};return`
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
            ${Fo(t,n.keyPoolId||``)}
          </select>
        </div>
        <div class="field-group">
          <label>注入方式</label>
          <select name="secrets_placement">
            ${Eo(yo,n.placement||`query`)}
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
  `}function rs(e={},t=[]){let n=e.rendering||{},r=n.clients||(ko(e.kind)?[`2d`]:[`2d`,`3d`]),i=t.filter(e=>!ko(e.kind)&&!Ao(e.kind));return`
    <fieldset class="form-card" style="margin-top:15px; padding:15px; background:white;">
      <legend style="padding:0 5px; font-weight:600;">渲染配置</legend>
      <div class="form-grid">
        <div class="field-group">
          <label>渲染引擎</label>
          <select name="rendering_engine">
            ${Eo(So,n.engine||(ko(e.kind)?`maplibre`:`leaflet`))}
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
  `}function is(e={}){let t=e.license||{};return`
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
            ${Eo([[`official`,`官方`],[`unofficial`,`非官方`],[`community`,`社区`],[`internal`,`内部`]],t.officialStatus||`official`)}
          </select>
        </div>
        <div class="field-group">
          <label>授权类型</label>
          <select name="license_licenseType">
            ${Eo([[`free`,`免费`],[`api-key`,`API Key`],[`commercial`,`商业授权`],[`unknown`,`未知`]],t.licenseType||`unknown`)}
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
  `}function as(e={}){let t=Number(e.retina?.normalValue);return go[t]?String(t):`1`}function os(e,t,n,r,i){let a=e!==!1,o=a?i:r;return`
    <button
      type="button"
      class="status-toggle ${a?`is-enabled`:`is-disabled`}"
      data-tile-sources-toggle-${t}="${Q(n)}"
      title="点击切换为${Q(o)}"
    >${Q(a?r:i)}</button>
  `}function ss(e){let t=String(e||``).toUpperCase();return t===`HIT`?`<span class="badge-green">HIT</span>`:t===`MISS`?`<span class="badge-red">MISS</span>`:t===`BYPASS`?`<span class="badge-gray">BYPASS</span>`:t===`REVALIDATED`?`<span class="badge-blue">REVAL</span>`:t===`STALE`?`<span class="badge-blue">STALE</span>`:t===`ERROR`?`<span class="badge-red">ERROR</span>`:`<span class="badge-gray">${Q(t||`-`)}</span>`}function cs(e){let t=Number(e.statusCode||0);return t>=200&&t<300?`<span class="badge-green">200 OK</span>`:`<span class="badge-red" title="${Q(e.errorMessage||``)}">${Q(e.statusCode||`-`)}</span>`}function ls(e){return e.proxyOutboundId?`<span class="badge-blue" title="池: ${Q(e.proxyPoolId||``)}">${Q(e.proxyOutboundId)}</span>`:e.proxyPoolId?`<span class="badge-blue">${Q(e.proxyPoolId)}</span>`:e.proxyConfigured?`<span class="badge-red" title="已配置代理，但本次未命中可用出口">代理未命中</span>`:`<span style="color:#94a3b8;">直连</span>`}async function us(e,t,n={}){let{tileSources:r=!1,sourcePresets:i=!1,keyPools:a=!1,mapLayers:o=!1,externalPublishes:s=!1,precacheCatalog:c=!0}=n,l=[],u=[];r&&(l.push(t.listTileSources()),u.push(t=>{e.tileSources=t})),i&&(l.push(t.listSourcePresets()),u.push(t=>{e.sourcePresets=t})),a&&(l.push(t.listKeyPools()),u.push(t=>{e.keyPools=t})),o&&(l.push(t.listMapLayers()),u.push(t=>{e.mapLayers=t})),s&&(l.push(t.listExternalPublishes()),u.push(t=>{e.externalPublishes=t})),c&&(l.push(t.precacheCatalog()),u.push(t=>{e.precacheCatalog=t})),(await Promise.all(l)).forEach((e,t)=>u[t](e))}function ds(e){e.tileSourcesSubTab=e.tileSourcesSubTab||`sources`;let t=[{id:`sources`,label:`图源`},{id:`presets`,label:`图源预设`},{id:`key-pools`,label:`密钥池`},{id:`layers`,label:`图层组合`},{id:`publishes`,label:`发布/API`},{id:`diagnostics`,label:`诊断日志`}],n=``;switch(e.tileSourcesSubTab){case`sources`:n=fs(e);break;case`presets`:n=ps(e);break;case`key-pools`:n=hs(e);break;case`layers`:n=gs(e);break;case`publishes`:n=_s(e);break;case`diagnostics`:n=vs(e);break;default:n=`<p>未知子页面</p>`}return`
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
  `}function fs(e){let t=e.tileSources||[],n=e.editingTileSource;if(n){let r=!t.some(e=>e.id===n.id),i=e.proxyOutbounds||[],a=e.proxyPools||[],o=e.keyPools||[],s=as(n),c=n.category||`custom`,l=n.kind||`xyz-raster`;return`
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
                ${Do(c,vo)}
                ${Eo(vo,c)}
              </select>
            </div>
          </div>
          <div class="form-grid">
            <div class="field-group">
              <label>图源类型</label>
              <select name="kind">
                ${Eo(_o,l)}
              </select>
            </div>
            <div class="field-group">
              <label>适配器</label>
              <input name="adapter" value="${Q(n.adapter||(ko(l)?`maplibre-style`:`template`))}" placeholder="template / wmts-kvp / maplibre-style / pmtiles">
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
          ${ts(n)}
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

          ${ns(n,o)}
          ${rs(n,t)}
          ${is(n)}

          <fieldset class="form-card" style="margin-top:15px; padding:15px; background:white;">
            <legend style="padding:0 5px; font-weight:600;">缓存策略</legend>
            ${Wo(n.cache,`cache`)}
          </fieldset>

          <fieldset class="form-card" style="margin-top:15px; padding:15px; background:white;">
            <legend style="padding:0 5px; font-weight:600;">代理策略</legend>
            ${Vo(n.proxy,i,a,`proxy`)}
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
        ${t.map(t=>{let n=e[`test_source_${t.id}`]||``,r=Mo(t);return`
            <tr>
              <td>
                <strong>${Q(t.name)}</strong>
                <div style="color: #64748b; font-size:11px; margin-top:2px;">${Q(t.id)}</div>
              </td>
              <td>
                <span class="badge-gray">${Q(t.vendor)}</span>
                <span class="badge-gray" style="margin-left:4px;">${Q(t.category)}</span>
                <span class="badge-blue" style="margin-left:4px;">${Q(Oo(t.kind))}</span>
                <span class="badge-gray" style="margin-left:4px;">${Q(zo(t))}</span>
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
                ${os(t.enabled,`source`,t.id,`启用中`,`已禁用`)}
              </td>
              <td>
                <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                  <button type="button" class="btn-link" data-tile-sources-test-source="${t.id}">测试</button>
                  ${n===`loading`?`<span class="test-status test-loading" style="margin-left: 0;">测试中...</span>`:``}
                  ${n&&n!==`loading`&&n.success?`<span class="test-status test-success" style="margin-left: 0;">通过 (${n.duration}ms)</span>`:``}
                  ${n&&n!==`loading`&&!n.success?`<span class="test-status test-fail" style="margin-left: 0;" title="${Q(To(n))}">失败</span>`:``}
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
  `}function ps(e){let t=e.sourcePresets||[],n=e.keyPools||[],r=e.creatingSourceFromPreset;if(r){let e=t.find(e=>e.presetId===r.presetId)||r,i=Io(e,n),a=r.keyPoolId||i?.id||``,o=e.status===`ready`;return`
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
              <input value="${Q(`${e.vendor||`custom`} / ${Oo(e.kind)}`)}" readonly>
            </div>
            <div class="field-group">
              <label>关联密钥池</label>
              <select name="keyPoolId">
                <option value="">${e.requiresKey?`稍后配置密钥池`:`无需密钥池`}</option>
                ${Fo(n,a)}
              </select>
              ${i?`<p style="color:#64748b; font-size:12px; margin:6px 0 0;">已自动匹配：${Q(i.name)} ${Lo(i)}</p>`:``}
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
        ${t.map(e=>{let t=Mo(e),r=Io(e,n);return`
            <tr>
              <td>
                <strong>${Q(e.name)}</strong>
                <div style="color:#64748b; font-size:11px; margin-top:2px;">${Q(e.presetId)}</div>
              </td>
              <td>
                <span class="badge-gray">${Q(e.vendor)}</span>
                <span class="badge-blue" style="margin-left:4px;">${Q(Oo(e.kind))}</span>
                <span class="badge-gray" style="margin-left:4px;">${Q(e.category)}</span>
              </td>
              <td>
                ${e.requiresKey?`<span class="badge-blue">需要 Key</span>`:`<span class="badge-gray">无需 Key</span>`}
                ${(e.requiredSecretTypes||[]).map(e=>`<span class="badge-gray" style="margin-left:4px;">${Q(e)}</span>`).join(``)}
                ${r?`<div style="margin-top:4px;"><span class="badge-gray">${Q(r.name)}</span> ${Lo(r)}</div>`:``}
              </td>
              <td>${Po(e.status)}</td>
              <td>
                ${No(e.cacheAllowedByLicense!==!1,`可缓存`,`禁缓存`)}
                ${No(!!e.publicUseAllowed,`可公开`,`慎公开`)}
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
  `}function ms(e,t=!1,n={}){return(e.keys||[]).map((r,i)=>{let a=n[`test_key_${e.id}_${r.id}`]||``,o=!r.hasSecret&&!r.maskedPreview,s=r.secretType||e.defaultSecretType||`api_key`,c=r.placement||e.defaultPlacement||`query`,l=r.paramName||e.defaultParamName||`key`;return`
      <div class="key-row" data-key-row="${i}">
        <div class="key-row-main">
          <label style="display:inline-flex; align-items:center; gap:6px; font-weight:500;">
            <input type="checkbox" name="key_enabled" ${r.enabled===!1?``:`checked`}>
            启用
          </label>
          <input name="key_id" required value="${Q(r.id||``)}" placeholder="key-a">
          <input name="key_alias" value="${Q(r.alias||``)}" placeholder="主 Key">
          <select name="key_secretType">
            ${Do(s,[[`api_key`,`api_key`],[`token`,`token`],[`tk`,`tk`],[`ak`,`ak`],[`appid`,`appid`]])}
            ${Eo([[`api_key`,`api_key`],[`token`,`token`],[`tk`,`tk`],[`ak`,`ak`],[`appid`,`appid`]],s)}
          </select>
        </div>
        <div class="key-row-main">
          <input name="key_secret" type="password" autocomplete="new-password" ${o?`required`:``} placeholder="${r.hasSecret?`留空保留 ${r.maskedPreview||`****`}`:`输入明文 Key`}">
          <select name="key_placement">
            ${Eo(yo,c)}
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
          ${a&&a!==`loading`&&!a.success?`<span class="test-status test-fail" title="${Q(To(a))}">不可用</span>`:``}
        </div>
      </div>
    `}).join(``)||`<p style="color:#64748b;">暂无 Key，请添加至少一个 Key。</p>`}function hs(e){let t=e.keyPools||[],n=e.sourcePresets||[],r=e.tileSources||[],i=e.editingKeyPool;if(i){let a=!t.some(e=>e.id===i.id);return`
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
                ${Eo(xo,i.scope||`global`)}
              </select>
            </div>
          </div>
          <div class="form-grid">
            <div class="field-group">
              <label>选择策略</label>
              <select name="strategy">
                ${Eo(bo,i.strategy||`round_robin`)}
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
                ${Do(i.defaultSecretType||`api_key`,[[`api_key`,`api_key`],[`token`,`token`],[`tk`,`tk`],[`ak`,`ak`],[`appid`,`appid`]])}
                ${Eo([[`api_key`,`api_key`],[`token`,`token`],[`tk`,`tk`],[`ak`,`ak`],[`appid`,`appid`]],i.defaultSecretType||`api_key`)}
              </select>
            </div>
            <div class="field-group">
              <label>默认注入方式 / 参数名</label>
              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
                <select name="defaultPlacement">
                  ${Eo(yo,i.defaultPlacement||`query`)}
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
              ${ms(i,!a,e)}
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
                ${t.credentialUrl?`<div style="margin-top:4px;">${Lo(t,`申请 / 管理 Key`)}</div>`:``}
              </td>
              <td>
                <span class="badge-gray">${Q(t.vendor)}</span>
                <span class="badge-blue" style="margin-left:4px;">${Q(bo.find(([e])=>e===t.strategy)?.[1]||t.strategy)}</span>
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
                ${n&&n!==`loading`&&!n.success?`<span class="test-status test-fail" title="${Q(To(n))}">失败</span>`:``}
              </td>
              <td>${os(t.enabled,`key-pool`,t.id,`启用中`,`已禁用`)}</td>
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
  `}function gs(e){let t=e.mapLayers||[],n=e.editingMapLayer;if(n){let r=!t.some(e=>e.id===n.id),i=e.tileSources||[],a=n.items||[{sourceId:``,opacity:1,zIndex:0}];return`
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
                    ${i.map(t=>`<option value="${t.id}" ${e.sourceId===t.id?`selected`:``}>${Q(t.name)} (${t.id} / ${Oo(t.kind)})</option>`).join(``)}
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
              ${os(t.enabled,`layer`,t.id,`启用中`,`已禁用`)}
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
  `}function _s(e){let t=e.externalPublishes||[],n=e.editingExternalPublish,r=e.selectedPublishId||t[0]?.id||``;if(n){let r=!t.some(e=>e.id===n.id),i=e.tileSources||[],a=i.filter(e=>e.visibility?.scope!==`external_only`&&e.permissions?.externalApiAllowed!==!1),o=i.filter(e=>e.visibility?.scope===`external_only`),s=e.mapLayers||[],c=e.proxyOutbounds||[],l=e.proxyPools||[],u=n.targetType||`source`,d=u===`layer`?s.map(e=>`<option value="${e.id}" ${n.targetId===e.id?`selected`:``}>${Q(e.name)} (${e.id})</option>`).join(``):u===`dedicated_source`?o.map(e=>`<option value="${e.id}" ${n.targetId===e.id?`selected`:``}>${Q(e.name)} (${e.id} / ${Oo(e.kind)})</option>`).join(``):a.map(e=>`<option value="${e.id}" ${n.targetId===e.id?`selected`:``}>${Q(e.name)} (${e.id} / ${Oo(e.kind)})</option>`).join(``),f=n.overrides?.proxy||null,p=n.overrides?.cache||null;return`
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
                <option value="">请选择${Q(Ro(u))}</option>
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
            ${Vo(f||{mode:`never`},c,l,`publish_proxy`)}
          </fieldset>

          <fieldset class="form-card" style="margin-top:15px; padding:15px; background:white;">
            <legend style="padding:0 5px; font-weight:600;">发布项缓存覆盖</legend>
            <div class="checkbox-group">
              <input type="checkbox" id="pub_cache_override" name="cache_override_enabled" ${p?`checked`:``}>
              <label for="pub_cache_override">覆盖目标图源缓存策略</label>
            </div>
            ${Wo(p||{enabled:!0},`publish_cache`)}
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
       </div>`:``,a=t.find(e=>e.id===r),o=``;return a&&(o=Bo(a,e)),`
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
              <td style="white-space: nowrap;"><span class="badge-gray">${Q(Ro(t.targetType))}</span></td>
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
                  ${n&&n!==`loading`&&!n.success?`<span class="test-status test-fail" style="margin-left: 0;" title="${Q(To(n))}">失败</span>`:``}
                </div>
              </td>
              <td style="white-space: nowrap;">
                ${os(t.enabled,`publish`,t.id,`已发布`,`已禁用`)}
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
  `}function vs(e){e.diagnosticsLogType=e.diagnosticsLogType||`source`;let t=e.diagnosticsPublishId||``,n=e.diagnosticsSourceId||``,r=e.externalPublishes||[],i=e.tileSources||[],a=e.diagnosticsLogType===`source`,o=a?e.sourceAccessLogs||[]:e.diagnosticLogs||[],s=a?e.sourceAccessLogsError||``:e.diagnosticLogsError||``;return`
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
            <td>${ls(e)}</td>
            <td>${Q(e.duration??0)}ms</td>
            <td>${ss(e.cacheStatus)}</td>
            <td>${cs(e)}</td>
          </tr>
        `).join(``)||`<tr><td colspan="9" style="text-align:center; color:#64748b; padding:20px;">${a?`暂无图源访问日志`:`暂无相关的对外访问日志`}</td></tr>`}
      </tbody>
    </table>
  `}async function ys(e,t){e.tileSourcesSubTab===`diagnostics`&&await bs(e,t)}async function bs(e,t){if(e.diagnosticsLogType=e.diagnosticsLogType||`source`,e.diagnosticsLogType===`source`){await Ss(e,t);return}await xs(e,t)}async function xs(e,t){e.loading=!0;try{let n=e.diagnosticsPublishId||``;e.diagnosticLogs=await t.listExternalPublishLogs(n),e.diagnosticLogsError=``}catch(t){e.diagnosticLogs=[],e.diagnosticLogsError=t.message}finally{e.loading=!1}}async function Ss(e,t){e.loading=!0;try{let n=e.diagnosticsSourceId||``;e.sourceAccessLogs=await t.listSourceAccessLogs(n),e.sourceAccessLogsError=``}catch(t){e.sourceAccessLogs=[],e.sourceAccessLogsError=t.message}finally{e.loading=!1}}async function Cs(e){let{event:t,state:n,api:r,renderDashboard:i,showConfirm:a,setNotice:o}=e,s=t.target.closest(`[data-tile-sources-tab]`);if(s)return n.tileSourcesSubTab=s.getAttribute(`data-tile-sources-tab`),n.editingTileSource=null,n.editingMapLayer=null,n.editingProxyOutbound=null,n.editingProxyPool=null,n.editingExternalPublish=null,n.editingKeyPool=null,n.creatingSourceFromPreset=null,n.tileSourcesSubTab===`diagnostics`&&await bs(n,r),i(),!0;if(t.target.closest(`[data-tile-sources-close-token-notice]`))return n.lastGeneratedToken=null,i(),!0;if(t.target.closest(`[data-tile-sources-refresh-logs]`))return await bs(n,r),i(),!0;let c=t.target.closest(`[data-tile-sources-diagnostics-type]`);if(c)return n.diagnosticsLogType=c.getAttribute(`data-tile-sources-diagnostics-type`),await bs(n,r),i(),!0;let l=t.target.closest(`[data-tile-sources-select-publish]`);if(l&&!t.target.closest(`button`))return n.selectedPublishId=l.getAttribute(`data-tile-sources-select-publish`),i(),!0;if(t.target.closest(`[data-tile-sources-add="source"]`))return n.editingTileSource={id:``,name:``,vendor:``,category:`custom`,kind:`xyz-raster`,adapter:`template`,presetId:``,entry:{template:``,styleJsonUrl:``,tileJsonUrl:``,pmtilesUrl:``,glyphsUrl:``,spritesUrl:``},minZoom:3,maxZoom:18,maxNativeZoom:18,tileSize:256,retina:{mode:`fixed`,param:`scale`,normalValue:`1`,retinaValue:`1`},subdomains:[],secrets:{required:!1,keyPoolId:``,placement:`query`,paramName:`key`},rendering:{engine:`leaflet`,clients:[`2d`,`3d`],fallbackRasterSourceId:``},cache:{enabled:!0,ttlMs:216e5,staleTtlMs:2592e6},proxy:{mode:`never`,fallbackToDirect:!1},accessLog:{enabled:!0,maxLogCount:500},permissions:{frontendVisible:!0,precacheAllowed:!0,externalApiAllowed:!0,userReferenceAllowed:!1},visibility:{scope:`system`},license:{cacheAllowedByLicense:!0,publicUseAllowed:!1,officialStatus:`internal`,licenseType:`unknown`}},i(),!0;if(t.target.closest(`[data-tile-sources-cancel="source"]`))return n.editingTileSource=null,i(),!0;let u=t.target.closest(`[data-tile-sources-toggle-source]`);if(u){let e=u.getAttribute(`data-tile-sources-toggle-source`),t=(n.tileSources||[]).find(t=>t.id===e);if(!t)return!0;let a=t.enabled===!1;n.loading=!0,i();try{await r.updateTileSource(e,{enabled:a}),await us(n,r,{tileSources:!0}),o(`图源已${a?`启用`:`禁用`}`)}catch(e){o(``,e.message)}finally{n.loading=!1,i()}return!0}let d=t.target.closest(`[data-tile-sources-edit-source]`);if(d){let e=d.getAttribute(`data-tile-sources-edit-source`);n.loading=!0,i();try{n.editingTileSource=await r.getTileSource(e)}catch(e){o(``,e.message)}finally{n.loading=!1,i()}return!0}let f=t.target.closest(`[data-tile-sources-delete-source]`);if(f){let e=f.getAttribute(`data-tile-sources-delete-source`);if(await a(`确定要删除图源 "${e}" 吗？如果该图源已被图层或发布项引用将报错阻止。`,`确认删除图源`)){n.loading=!0,i();try{await r.deleteTileSource(e),await us(n,r,{tileSources:!0}),o(`删除图源成功`)}catch(e){o(``,e.message)}finally{n.loading=!1,i()}}return!0}let p=t.target.closest(`[data-tile-sources-test-source]`);if(p){let e=p.getAttribute(`data-tile-sources-test-source`);n[`test_source_${e}`]=`loading`,i();try{let t=await r.testTileSource(e);n[`test_source_${e}`]=t}catch(t){n[`test_source_${e}`]={success:!1,error:t.message}}finally{i()}return!0}let m=t.target.closest(`[data-tile-sources-create-from-preset]`);if(m){let e=m.getAttribute(`data-tile-sources-create-from-preset`),t=(n.sourcePresets||[]).find(t=>t.presetId===e);if(!t)return!0;let r=Io(t,n.keyPools||[]);return n.creatingSourceFromPreset={presetId:e,id:e.replace(/^preset:/,``),name:t.name,enabled:!1,keyPoolId:r?.id||``,permissions:{frontendVisible:!1,externalApiAllowed:!1,userReferenceAllowed:!1}},i(),!0}if(t.target.closest(`[data-tile-sources-cancel="preset-source"]`))return n.creatingSourceFromPreset=null,i(),!0;if(t.target.closest(`[data-tile-sources-add="key-pool"]`))return n.editingKeyPool={id:``,name:``,vendor:`custom`,enabled:!0,scope:`global`,strategy:`round_robin`,cooldownMs:3e5,maxRetriesPerRequest:2,defaultSecretType:`api_key`,defaultPlacement:`query`,defaultParamName:`key`,credentialUrl:``,allowedPresetIds:[],allowedSourceIds:[],keys:[{id:``,alias:``,enabled:!0,secretType:`api_key`,placement:`query`,paramName:`key`,priority:100,weight:1,qpsLimit:0,dailyLimit:0,monthlyLimit:0}],description:``},i(),!0;if(t.target.closest(`[data-tile-sources-cancel="key-pool"]`))return n.editingKeyPool=null,i(),!0;let h=t.target.closest(`[data-tile-sources-toggle-key-pool]`);if(h){let e=h.getAttribute(`data-tile-sources-toggle-key-pool`),t=(n.keyPools||[]).find(t=>t.id===e);if(!t)return!0;let a=t.enabled===!1;n.loading=!0,i();try{await r.updateKeyPool(e,{enabled:a}),await us(n,r,{keyPools:!0,precacheCatalog:!1}),o(`密钥池已${a?`启用`:`禁用`}`)}catch(e){o(``,e.message)}finally{n.loading=!1,i()}return!0}let g=t.target.closest(`[data-tile-sources-edit-key-pool]`);if(g){let e=g.getAttribute(`data-tile-sources-edit-key-pool`);n.loading=!0,i();try{n.editingKeyPool=await r.getKeyPool(e)}catch(e){o(``,e.message)}finally{n.loading=!1,i()}return!0}let _=t.target.closest(`[data-tile-sources-delete-key-pool]`);if(_){let e=_.getAttribute(`data-tile-sources-delete-key-pool`);if(await a(`确认删除密钥池 "${e}"？如果仍被图源引用将被后端阻止。`,`删除密钥池`)){n.loading=!0,i();try{await r.deleteKeyPool(e),await us(n,r,{keyPools:!0,precacheCatalog:!1}),o(`删除密钥池成功`)}catch(e){o(``,e.message)}finally{n.loading=!1,i()}}return!0}let ee=t.target.closest(`[data-tile-sources-test-key-pool]`);if(ee){let e=ee.getAttribute(`data-tile-sources-test-key-pool`);n[`test_key_pool_${e}`]=`loading`,i();try{n[`test_key_pool_${e}`]=await r.testKeyPool(e)}catch(t){n[`test_key_pool_${e}`]={success:!1,error:t.message}}finally{i()}return!0}let te=t.target.closest(`[data-tile-sources-test-key]`);if(te){es(n,te.closest(`form`));let[e,t]=te.getAttribute(`data-tile-sources-test-key`).split(`:`);n[`test_key_${e}_${t}`]=`loading`,i();try{n[`test_key_${e}_${t}`]=await r.testKeyPoolKey(e,t)}catch(r){n[`test_key_${e}_${t}`]={success:!1,error:r.message}}finally{i()}return!0}if(t.target.closest(`[data-tile-sources-add-key]`))return n.editingKeyPool?(es(n,t.target.closest(`form`)),n.editingKeyPool.keys=n.editingKeyPool.keys||[],n.editingKeyPool.keys.push({id:``,alias:``,enabled:!0,secretType:n.editingKeyPool.defaultSecretType||`api_key`,placement:n.editingKeyPool.defaultPlacement||`query`,paramName:n.editingKeyPool.defaultParamName||`key`,priority:100,weight:1,qpsLimit:0,dailyLimit:0,monthlyLimit:0}),i(),!0):!0;let v=t.target.closest(`[data-tile-sources-remove-key]`);if(v){if(!n.editingKeyPool)return!0;es(n,v.closest(`form`));let e=parseInt(v.getAttribute(`data-tile-sources-remove-key`),10);return n.editingKeyPool.keys.splice(e,1),i(),!0}if(t.target.closest(`[data-tile-sources-add="layer"]`))return n.editingMapLayer={id:``,name:``,type:`base`,sortOrder:10,minZoom:3,maxZoom:18,clients:[`2d`,`3d`],items:[{sourceId:``,opacity:1,zIndex:0}]},i(),!0;if(t.target.closest(`[data-tile-sources-cancel="layer"]`))return n.editingMapLayer=null,i(),!0;let ne=t.target.closest(`[data-tile-sources-toggle-layer]`);if(ne){let e=ne.getAttribute(`data-tile-sources-toggle-layer`),t=(n.mapLayers||[]).find(t=>t.id===e);if(!t)return!0;let a=t.enabled===!1;if(t.default&&!a)return o(``,`默认图层不能直接禁用，请先设置新的默认图层`),!0;n.loading=!0,i();try{await r.updateMapLayer(e,{enabled:a}),await us(n,r,{mapLayers:!0}),o(`组合图层已${a?`启用`:`禁用`}`)}catch(e){o(``,e.message)}finally{n.loading=!1,i()}return!0}let re=t.target.closest(`[data-tile-sources-edit-layer]`);if(re){let e=re.getAttribute(`data-tile-sources-edit-layer`);return n.editingMapLayer=JSON.parse(JSON.stringify(n.mapLayers.find(t=>t.id===e))),i(),!0}let y=t.target.closest(`[data-tile-sources-delete-layer]`);if(y){let e=y.getAttribute(`data-tile-sources-delete-layer`);if(await a(`确认删除图层组合 "${e}"？`,`确认删除`)){n.loading=!0,i();try{await r.deleteMapLayer(e),await us(n,r,{mapLayers:!0}),o(`删除图层组合成功`)}catch(e){o(``,e.message)}finally{n.loading=!1,i()}}return!0}let b=t.target.closest(`[data-tile-sources-set-default]`);if(b){let e=b.getAttribute(`data-tile-sources-set-default`);n.loading=!0,i();try{await r.setDefaultMapLayer(e),await us(n,r,{mapLayers:!0}),o(`已将该图层设为默认展示`)}catch(e){o(``,e.message)}finally{n.loading=!1,i()}return!0}if(t.target.closest(`[data-tile-sources-add-layer-item]`))return n.editingMapLayer.items.push({sourceId:``,opacity:1,zIndex:n.editingMapLayer.items.length}),i(),!0;let x=t.target.closest(`[data-tile-sources-remove-layer-item]`);if(x){let e=parseInt(x.getAttribute(`data-tile-sources-remove-layer-item`));return n.editingMapLayer.items.length>1?(n.editingMapLayer.items.splice(e,1),i()):o(``,`图层组合中必须包含至少一个图源`),!0}let S=t.target.closest(`[data-tile-sources-move-up]`);if(S){let e=parseInt(S.getAttribute(`data-tile-sources-move-up`));if(e>0){let t=n.editingMapLayer.items,r=t[e];t[e]=t[e-1],t[e-1]=r,i()}return!0}let ie=t.target.closest(`[data-tile-sources-move-down]`);if(ie){let e=parseInt(ie.getAttribute(`data-tile-sources-move-down`)),t=n.editingMapLayer.items;if(e<t.length-1){let n=t[e];t[e]=t[e+1],t[e+1]=n,i()}return!0}if(t.target.closest(`[data-tile-sources-add="publish"]`))return n.editingExternalPublish={id:``,name:``,targetType:`source`,targetId:``,pathSlug:``,auth:{mode:`token`},rateLimit:{enabled:!0,maxRequestsPerMinute:600},log:{enabled:!0,maxLogCount:500},overrides:{proxy:null,cache:null},enabled:!0},i(),!0;if(t.target.closest(`[data-tile-sources-cancel="publish"]`))return n.editingExternalPublish=null,i(),!0;let C=t.target.closest(`[data-tile-sources-toggle-publish]`);if(C){let e=C.getAttribute(`data-tile-sources-toggle-publish`),t=(n.externalPublishes||[]).find(t=>t.id===e);if(!t)return!0;let a=t.enabled===!1;n.loading=!0,i();try{await r.updateExternalPublish(e,{enabled:a}),await us(n,r,{externalPublishes:!0,precacheCatalog:!1}),o(`对外发布项已${a?`发布`:`禁用`}`)}catch(e){o(``,e.message)}finally{n.loading=!1,i()}return!0}let ae=t.target.closest(`[data-tile-sources-edit-publish]`);if(ae){let e=ae.getAttribute(`data-tile-sources-edit-publish`);return n.editingExternalPublish=JSON.parse(JSON.stringify(n.externalPublishes.find(t=>t.id===e))),i(),!0}let w=t.target.closest(`[data-tile-sources-delete-publish]`);if(w){let e=w.getAttribute(`data-tile-sources-delete-publish`);if(await a(`确认注销并删除外部发布接口项 "${e}" 吗？`,`注销对外服务`)){n.loading=!0,i();try{await r.deleteExternalPublish(e),await us(n,r,{externalPublishes:!0,precacheCatalog:!1}),o(`成功注销对外发布服务`)}catch(e){o(``,e.message)}finally{n.loading=!1,i()}}return!0}let T=t.target.closest(`[data-tile-sources-reset-token]`);if(T){let e=T.getAttribute(`data-tile-sources-reset-token`);if(await a(`确认要重置该对外服务的 Token 吗？旧 Token 将会立即失效！`,`重置 Token 凭证`)){n.loading=!0,i();try{n.lastGeneratedToken=(await r.resetExternalPublishToken(e)).token,await us(n,r,{externalPublishes:!0,precacheCatalog:!1}),o(`Token 已重置，请记录您的新明文 Token`)}catch(e){o(``,e.message)}finally{n.loading=!1,i()}}return!0}let E=t.target.closest(`[data-tile-sources-test-publish]`);if(E){let e=E.getAttribute(`data-tile-sources-test-publish`);n[`test_publish_${e}`]=`loading`,i();try{let t=await r.testExternalPublish(e);n[`test_publish_${e}`]=t}catch(t){n[`test_publish_${e}`]={success:!1,error:t.message}}finally{i()}return!0}return!1}async function ws(e){let{event:t,state:n,api:r,renderDashboard:i,setNotice:a}=e,o=t.target.closest(`[data-tile-sources-form]`);if(!o)return!1;t.preventDefault();let s=o.getAttribute(`data-tile-sources-form`);n.loading=!0,i();let c=new FormData(o),l=c.get(`isNew`)===`true`;try{if(s===`source`){let e=c.get(`id`),t=c.get(`tileScale`)||`1`,i=c.get(`kind`)||`xyz-raster`,s=Yo(c),u=Zo(o,c);ko(i)&&u.engine===`leaflet`&&(u.engine=`maplibre`);let d={id:e,name:c.get(`name`),enabled:!!o.elements.enabled?.checked,vendor:c.get(`vendor`),category:c.get(`category`),kind:i,adapter:c.get(`adapter`),presetId:c.get(`presetId`)||``,schema:c.get(`schema`)||``,entry:s,template:s.template,styleJsonUrl:s.styleJsonUrl,tileJsonUrl:s.tileJsonUrl,pmtilesUrl:s.pmtilesUrl,subdomains:Jo(c,`subdomains`),minZoom:parseInt(c.get(`minZoom`)),maxZoom:parseInt(c.get(`maxZoom`)),maxNativeZoom:parseInt(c.get(`maxNativeZoom`)),tileSize:256,retina:{mode:`fixed`,param:`scale`,normalValue:t,retinaValue:t},secrets:Xo(o,c),rendering:u,attribution:c.get(`license_attribution`)||``,coordinateSystem:c.get(`coordinateSystem`)||`EPSG:3857`,tags:Jo(c,`tags`),description:c.get(`description`),license:Qo(o,c),cache:qo(o,c,`cache`),proxy:Go(o,c,`proxy`),accessLog:{enabled:!!o.elements.accessLog_enabled?.checked,maxLogCount:parseInt(c.get(`accessLog_maxLogCount`))||0},permissions:{frontendVisible:o.elements.perm_frontendVisible.checked,precacheAllowed:o.elements.perm_precacheAllowed.checked,externalApiAllowed:o.elements.perm_externalApiAllowed.checked,userReferenceAllowed:!!o.elements.perm_userReferenceAllowed?.checked},visibility:{scope:c.get(`visibility_scope`)||`system`}};l?await r.createTileSource(d):await r.updateTileSource(e,d),n.editingTileSource=null,await us(n,r,{tileSources:!0}),a(`保存图源配置成功`)}else if(s===`preset-source`){let e=c.get(`presetId`),t=o.elements.enabled,i={id:c.get(`id`),name:c.get(`name`),enabled:!!(t&&!t.disabled&&t.checked),keyPoolId:c.get(`keyPoolId`)||``,permissions:{frontendVisible:!!o.elements.perm_frontendVisible?.checked,precacheAllowed:!1,externalApiAllowed:!!o.elements.perm_externalApiAllowed?.checked,userReferenceAllowed:!!o.elements.perm_userReferenceAllowed?.checked},visibility:{scope:`system`}};await r.createSourceFromPreset(e,i),n.creatingSourceFromPreset=null,n.tileSourcesSubTab=`sources`,await us(n,r,{tileSources:!0}),a(`已基于预设创建图源`)}else if(s===`key-pool`){let e=c.get(`id`),t=$o(o,c);l?await r.createKeyPool(t):await r.updateKeyPool(e,t),n.editingKeyPool=null,await us(n,r,{keyPools:!0,precacheCatalog:!1}),a(`保存密钥池成功`)}else if(s===`layer`){let e=c.get(`id`),t=o.querySelectorAll(`select[name="item_sourceId"]`),i=o.querySelectorAll(`input[name="item_opacity"]`),s=[];if(t.forEach((e,t)=>{e.value&&s.push({sourceId:e.value,opacity:parseFloat(i[t].value||1),zIndex:t})}),!s.length)throw Error(`组合图层必须包含至少一个有效图源`);let u={id:e,name:c.get(`name`),enabled:o.elements.enabled.checked,frontendVisible:o.elements.frontendVisible.checked,default:n.editingMapLayer.default||!1,type:c.get(`type`),sortOrder:parseInt(c.get(`sortOrder`)),minZoom:parseInt(c.get(`minZoom`)),maxZoom:parseInt(c.get(`maxZoom`)),clients:[o.elements.client_2d.checked?`2d`:``,o.elements.client_3d.checked?`3d`:``].filter(Boolean),items:s,description:c.get(`description`)};l?await r.createMapLayer(u):await r.updateMapLayer(e,u),n.editingMapLayer=null,await us(n,r,{mapLayers:!0}),a(`保存图层组合成功`)}else if(s===`publish`){let e=c.get(`id`),t=!!o.elements.proxy_override_enabled?.checked,i=!!o.elements.cache_override_enabled?.checked,s={id:e,name:c.get(`name`),enabled:o.elements.enabled.checked,targetType:c.get(`targetType`),targetId:c.get(`targetId`),pathSlug:c.get(`pathSlug`),auth:{mode:c.get(`auth_mode`)},rateLimit:{enabled:o.elements.rateLimit_enabled.checked,maxRequestsPerMinute:parseInt(c.get(`rateLimit_maxRequestsPerMinute`))},log:{enabled:o.elements.log_enabled.checked,maxLogCount:parseInt(c.get(`log_maxLogCount`))},overrides:{proxy:t?Go(o,c,`publish_proxy`):null,cache:i?qo(o,c,`publish_cache`):null}};l?n.lastGeneratedToken=(await r.createExternalPublish(s)).token:await r.updateExternalPublish(e,s),n.editingExternalPublish=null,await us(n,r,{externalPublishes:!0,precacheCatalog:!1}),a(`保存对外发布服务成功`)}}catch(e){a(``,e.message)}finally{n.loading=!1,i()}return!0}async function Ts(e){let{event:t,state:n,renderDashboard:r}=e,i=t.target.closest(`[data-proxy-mode-select]`);if(i){let e=i.value,t=i.closest(`form`),n=t.querySelector(`[data-proxy-outbound-field]`),r=t.querySelector(`[data-proxy-pool-field]`);return n&&(n.style.display=e===`fixed`?`flex`:`none`),r&&(r.style.display=e===`pool`?`flex`:`none`),!0}let a=t.target.closest(`select[name="kind"]`);if(a&&n.editingTileSource){let e=a.closest(`form`),t=e.elements.adapter,n=e.elements.rendering_engine,r=e.elements.rendering_client_3d;return ko(a.value)?(t&&(!t.value||t.value===`template`)&&(t.value=`maplibre-style`),n&&n.value===`leaflet`&&(n.value=`maplibre`),r&&(r.checked=!1)):t&&!t.value&&(t.value=`template`),!0}let o=t.target.closest(`[data-publish-target-type]`);if(o&&n.editingExternalPublish)return n.editingExternalPublish.targetType=o.value,n.editingExternalPublish.targetId=``,r(),!0;let s=t.target.closest(`[data-tile-sources-diagnostic-filter]`);if(s)return n.diagnosticsLogType=`external`,n.diagnosticsPublishId=s.value,await xs(n,e.api),r(),!0;let c=t.target.closest(`[data-tile-sources-source-diagnostic-filter]`);if(c)return n.diagnosticsLogType=`source`,n.diagnosticsSourceId=c.value,await Ss(n,e.api),r(),!0;if(n.editingMapLayer){let e=t.target.closest(`select[name="item_sourceId"]`),r=t.target.closest(`input[name="item_opacity"]`);if(e||r){let i=t.target.closest(`[data-layer-item-index]`),a=parseInt(i.getAttribute(`data-layer-item-index`));return e&&(n.editingMapLayer.items[a].sourceId=e.value),r&&(n.editingMapLayer.items[a].opacity=parseFloat(r.value||1)),!0}}return!1}function Es(e){return e?.errorMessage||e?.error||``}function Ds(e){let t=Array.isArray(e?.members)?e.members:[];if(!t.length)return{successCount:0,totalCount:0,fastestMs:null};let n=t.filter(e=>e.success),r=n.map(e=>Number(e.duration)).filter(Number.isFinite);return{successCount:n.length,totalCount:t.length,fastestMs:r.length?Math.min(...r):null}}function Os(e){e.editingProxyOutbound=e.editingProxyOutbound||null,e.editingProxyPool=e.editingProxyPool||null;let t=e.proxyOutbounds||[],n=e.proxyPools||[],r=e.editingProxyOutbound,i=e.editingProxyPool,a=``;if(r){let e=!t.some(e=>e.id===r.id);a=`
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
                    ${n&&n!==`loading`&&!n.success?`<span class="test-status test-fail" title="${Q(Es(n))}">失败: ${Q(Es(n))}</span>`:``}
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
            ${n.map(t=>{let n=e[`test_pool_${t.id}`]||``,r=n&&n!==`loading`?Ds(n):null;return`
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
                    ${n&&n!==`loading`&&!n.success?`<span class="test-status test-fail" title="${Q(Es(n))}">失败: ${Q(Es(n))}</span>`:``}
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
  `}function ks(e){e.editingProxyOutbound=null,e.editingProxyPool=null}async function As({api:e,event:t,state:n,renderDashboard:r,showConfirm:i,setNotice:a}){if(t.target.closest(`[data-proxy-add="outbound"]`))return n.editingProxyOutbound={id:``,name:``,protocol:`http`,host:``,port:7890,username:``,password:``,testUrl:`https://www.google.com/generate_204`,timeoutMs:8e3,description:``,enabled:!0},r(),!0;if(t.target.closest(`[data-proxy-cancel="outbound"]`))return n.editingProxyOutbound=null,r(),!0;if(t.target.closest(`[data-proxy-edit-outbound]`)){let e=t.target.closest(`[data-proxy-edit-outbound]`).getAttribute(`data-proxy-edit-outbound`);return n.editingProxyOutbound=JSON.parse(JSON.stringify(n.proxyOutbounds.find(t=>t.id===e))),r(),!0}if(t.target.closest(`[data-proxy-delete-outbound]`)){let o=t.target.closest(`[data-proxy-delete-outbound]`).getAttribute(`data-proxy-delete-outbound`);if(await i(`确认删除代理出口 “${Q(o)}” 吗？`)){a(`正在删除代理出口`);try{await e.deleteProxyOutbound(o),n.proxyOutbounds=await e.listProxyOutbounds(),a(`删除成功`)}catch(e){a(``,e.message)}r()}return!0}if(t.target.closest(`[data-proxy-test-outbound]`)){let i=t.target.closest(`[data-proxy-test-outbound]`).getAttribute(`data-proxy-test-outbound`);n[`test_outbound_${i}`]=`loading`,r();try{let t=await e.testProxyOutbound(i);n[`test_outbound_${i}`]=t}catch(e){n[`test_outbound_${i}`]={success:!1,error:e.message}}return r(),!0}if(t.target.closest(`[data-proxy-add="pool"]`))return n.editingProxyPool={id:``,name:``,strategy:`priority`,description:``,enabled:!0,members:[]},r(),!0;if(t.target.closest(`[data-proxy-cancel="pool"]`))return n.editingProxyPool=null,r(),!0;if(t.target.closest(`[data-proxy-edit-pool]`)){let e=t.target.closest(`[data-proxy-edit-pool]`).getAttribute(`data-proxy-edit-pool`);return n.editingProxyPool=JSON.parse(JSON.stringify(n.proxyPools.find(t=>t.id===e))),r(),!0}if(t.target.closest(`[data-proxy-delete-pool]`)){let o=t.target.closest(`[data-proxy-delete-pool]`).getAttribute(`data-proxy-delete-pool`);if(await i(`确认删除代理池 “${Q(o)}” 吗？`)){a(`正在删除代理池`);try{await e.deleteProxyPool(o),n.proxyPools=await e.listProxyPools(),a(`删除成功`)}catch(e){a(``,e.message)}r()}return!0}if(t.target.closest(`[data-proxy-test-pool]`)){let i=t.target.closest(`[data-proxy-test-pool]`).getAttribute(`data-proxy-test-pool`);n[`test_pool_${i}`]=`loading`,r();try{let t=await e.testProxyPool(i);n[`test_pool_${i}`]=t}catch(e){n[`test_pool_${i}`]={success:!1,error:e.message}}return r(),!0}return!1}async function js({api:e,event:t,state:n,renderDashboard:r,setNotice:i}){let a=t.target.closest(`[data-proxy-form="outbound"]`);if(a){t.preventDefault(),i(`正在保存代理出口`);let o=a.elements.isNew.value===`true`,s=a.elements.id.value.trim(),c={name:a.elements.name.value.trim(),protocol:a.elements.protocol.value,host:a.elements.host.value.trim(),port:parseInt(a.elements.port.value,10),username:a.elements.username.value.trim(),testUrl:a.elements.testUrl.value.trim(),timeoutMs:parseInt(a.elements.timeoutMs.value,10),description:a.elements.description.value.trim(),enabled:a.elements.enabled.checked},l=a.elements.password.value;l&&(c.password=l);try{o?await e.createProxyOutbound({id:s,...c}):await e.updateProxyOutbound(s,c),n.proxyOutbounds=await e.listProxyOutbounds(),n.editingProxyOutbound=null,i(`保存成功`)}catch(e){i(``,e.message)}return r(),!0}let o=t.target.closest(`[data-proxy-form="pool"]`);if(o){t.preventDefault(),i(`正在保存代理池`);let a=o.elements.isNew.value===`true`,s=o.elements.id.value.trim(),c=[];o.querySelectorAll(`input[name="pool_outbound_id"]:checked`).forEach(e=>{let t=e.value,n=parseInt(o.querySelector(`[name="pool_priority_${t}"]`).value,10),r=parseInt(o.querySelector(`[name="pool_weight_${t}"]`).value,10);c.push({outboundId:t,priority:n,weight:r})});let l={name:o.elements.name.value.trim(),strategy:o.elements.strategy.value,description:o.elements.description.value.trim(),enabled:o.elements.enabled.checked,members:c};try{a?await e.createProxyPool({id:s,...l}):await e.updateProxyPool(s,l),n.proxyPools=await e.listProxyPools(),n.editingProxyPool=null,i(`保存成功`)}catch(e){i(``,e.message)}return r(),!0}return!1}function Ms(){return!1}var Ns=[{id:`overview`,label:`概览`,render:ia},{id:`cache`,label:`缓存`,render:aa,handleClick:oa},{id:`kml`,label:`KML管理`,render:so,handleClick:co,handleChange:lo},{id:`precache`,label:`预缓存`,render:wa,afterRender:no,afterEnter:Ba,afterLoad:Ba,handleSubmit:Wa,handleClick:Ga,handleChange:Ka},{id:`tile-sources`,label:`图源管理`,render:ds,afterEnter:ys,afterLoad:ys,handleClick:Cs,handleSubmit:ws,handleChange:Ts},{id:`proxy`,label:`代理配置`,render:Os,afterEnter:ks,afterLoad:ks,handleClick:As,handleSubmit:js,handleChange:Ms},{id:`settings`,label:`设置`,render:ao,handleSubmit:oo}];function Ps(e){return`/admin/${Fs(e).id}`}function Fs(e){return Ns.find(t=>t.id===e)||Ns[0]}function Is(e){return Ns.some(t=>t.id===e)}function Ls(e){return e.pathname===`/admin`||e.pathname.startsWith(`/admin/`)||new URLSearchParams(e.search).get(`view`)===`admin`}function Rs(e){let[,t,n]=e.pathname.split(`/`);if(t===`admin`)return Is(n)?n:`overview`;let r=new URLSearchParams(e.search).get(`tab`);return Is(r)?r:`overview`}function zs(e){if(!e.message&&!e.error&&!e.loading)return``;let t=e.error||e.message||`正在加载`,n=!!e.error,r=!e.error&&(e.message===`正在加载`||e.message===`正在登录`||e.loading);return`
    <div class="admin-notice ${n?`is-error`:``}" role="${n?`alert`:`status`}" aria-live="${n?`assertive`:`polite`}">
      <span>${Q(t)}</span>
      ${r?``:`<button type="button" class="admin-notice-close" data-admin-action="close-notice" aria-label="关闭提示">×</button>`}
    </div>
  `}function Bs(e){e.root.innerHTML=`
    <section class="admin-login">
      <form class="admin-login-panel" data-admin-login>
        <p class="admin-kicker">map-service</p>
        <h1>管理后台</h1>
        ${zs(e)}
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
  `}function Vs(e,t){e.root.innerHTML=`
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
      ${zs(e)}
      <div class="admin-layout">
        <nav class="admin-tabs" aria-label="后台导航">
          ${Ns.map(t=>`
            <a href="${Ps(t.id)}" data-admin-tab="${t.id}" class="${e.activeTab===t.id?`is-active`:``}">
              ${Q(t.label)}
            </a>
          `).join(``)}
        </nav>
        <div class="admin-content">
          ${t}
        </div>
      </div>
    </section>
  `}var $={root:null,activeTab:`overview`,loading:!1,message:``,error:``,session:null,system:null,cache:null,cacheLoading:!1,cacheError:``,visits:null,visitsLoading:!1,visitsError:``,settings:null,tasks:[],kmls:[],precacheForm:{providerId:``,bounds:{west:113.24,south:23.11,east:113.29,north:23.15},minZoom:12,maxZoom:12,concurrency:4,requestIntervalMs:0,refresh:!1},precacheEstimate:null,precacheEstimateStatus:``,precacheEstimateError:``,expandedTaskIds:new Set,amapLoader:null,AMap:null,map:null,rectangle:null,precacheMapHeight:260},Hs=null;function Us(e){Hs=e}function Ws(e=``,t=``){$.message=e,$.error=t,Hs&&Hs(e,t)}function Gs(e){Is(e)&&($.activeTab=e)}var Ks=null;Us((e,t)=>{Ks&&=(clearTimeout(Ks),null);let n=t||e;n&&n!==`正在加载`&&n!==`正在登录`&&(Ks=setTimeout(()=>{Ws(``),document.querySelector(`[data-admin-login]`)?Bs($):Xs()},4e3))});function qs(){return Rs(window.location)}function Js(e){window.history.replaceState(null,``,`${Ps(e)}${window.location.hash}`)}function Ys(){return Fs($.activeTab).render($)}function Xs(){Vs($,Ys()),Fs($.activeTab).afterRender?.($,Zi)}window.renderDashboard=Xs;function Zs(e){return{api:Zi,event:e,renderDashboard:Xs,setNotice:Ws,showCheckboxConfirm:Te,showConfirm:we,state:$}}function Qs(...e){(!e.length||e.includes($.activeTab))&&Xs()}async function $s(e,t){let n=Fs($.activeTab)[e];return n instanceof Function?!!await n(Zs(t)):!1}async function ec(e={}){let t=!!e.cacheOnly;Object.assign($,{cacheLoading:!0,cacheError:``,visitsLoading:t?$.visitsLoading:!0,visitsError:t?$.visitsError:``}),Qs(`overview`,`cache`),Zi.cache().then(e=>{$.cache=e,$.cacheError=``,e.refreshing&&window.setTimeout(()=>ec({cacheOnly:!0}),1500)}).catch(e=>{$.cacheError=e.message}).finally(()=>{$.cacheLoading=!1,Qs(`cache`)}),!t&&Zi.visits().then(e=>{$.visits=e,$.visitsError=``}).catch(e=>{$.visitsError=e.message}).finally(()=>{$.visitsLoading=!1,Qs(`overview`)})}async function tc(){$.loading=!0,Ws(`正在加载`),Xs();try{let[e,t,n,r,i,a,o,s,c,l,u,d,f]=await Promise.all([Zi.session(),Zi.system(),Zi.settings(),Zi.tasks(),Zi.kmls(),Zi.listTileSources(),Zi.listSourcePresets(),Zi.listKeyPools(),Zi.listMapLayers(),Zi.listProxyOutbounds(),Zi.listProxyPools(),Zi.listExternalPublishes(),Zi.precacheCatalog()]);Object.assign($,{session:e,system:t,settings:n,tasks:r,kmls:i,tileSources:a,sourcePresets:o,keyPools:s,mapLayers:c,proxyOutbounds:l,proxyPools:u,externalPublishes:d,precacheCatalog:f,loading:!1}),Ws(``),Xs(),Fs($.activeTab).afterLoad?.($,Zi),ec()}catch(e){$.loading=!1,e.status===401?(Xi(),Ws(``,e.message),Bs($)):(Ws(``,e.message),Xs())}}async function nc(e){let t=e.target.closest(`[data-admin-login]`);if(t){e.preventDefault(),Ws(`正在登录`),Bs($);try{await Yi({username:t.elements.username.value,password:t.elements.password.value}),Ws(``),await tc()}catch(e){Ws(``,e.message),Bs($)}return}await $s(`handleSubmit`,e)}async function rc(e){let t=e.target.closest(`[data-admin-tab]`);if(t){e.preventDefault(),Gs(t.getAttribute(`data-admin-tab`)),Js($.activeTab),Xs(),Fs($.activeTab).afterEnter?.($,Zi);return}let n=e.target.closest(`[data-admin-action]`);if(n){let e=n.getAttribute(`data-admin-action`);if(e===`logout`){Xi(),Ws(``),Bs($);return}if(e===`refresh`){await tc();return}if(e===`close-notice`){Ws(``),document.querySelector(`[data-admin-login]`)?Bs($):Xs();return}}await $s(`handleClick`,e)}async function ic(e){await $s(`handleChange`,e)}async function ac(e={}){if(document.body.classList.add(`admin-view`),Gs(qs()),Js($.activeTab),$.amapLoader=e.amapLoader||null,$.root=document.getElementById(`admin-root`),$.root.hidden=!1,$.root.addEventListener(`submit`,nc),$.root.addEventListener(`click`,rc),$.root.addEventListener(`change`,ic),$.root.addEventListener(`input`,ic),!qi()){Bs($);return}await tc()}function oc(){`serviceWorker`in navigator&&window.addEventListener(`load`,()=>{navigator.serviceWorker.register(`/sw.js`).catch(e=>{console.warn(`Service Worker 注册失败`,e)})})}async function sc(e){let{init:t,title:n=`私有地图服务`,message:r=`管理员启用了访问控制，请输入密码解锁`,submitText:i=`载入地图`,loadingText:a=`正在验证...`}=e;try{(await Qi()).required?cc({init:t,title:n,message:r,submitText:i,loadingText:a}):await t()}catch(e){console.error(`Failed to check map access status`,e),cc({init:t,title:n,message:`访问状态检查失败，请稍后重试`,submitText:i,loadingText:a,allowRetry:!0})}}function cc(e){let{init:t,title:n,message:r,submitText:i,loadingText:a,allowRetry:o=!1}=e;document.getElementById(`map-lock-screen`)?.remove();let s=document.createElement(`div`);s.id=`map-lock-screen`,s.className=`lock-screen-backdrop`,s.innerHTML=`
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
  `,document.body.appendChild(s);let c=document.getElementById(`lock-screen-form`),l=document.getElementById(`lock-screen-error`);s.querySelector(`[data-lock-retry]`)?.addEventListener(`click`,()=>{s.remove(),sc({init:t,title:n,submitText:i,loadingText:a})}),c.addEventListener(`submit`,async e=>{e.preventDefault(),l.style.display=`none`;let n=c.elements.password.value.trim();if(!n)return;let r=c.querySelector(`button[type="submit"]`);try{r.disabled=!0,r.textContent=a,await $i(n),s.remove(),await t()}catch(e){r.disabled=!1,r.textContent=i,l.textContent=e.message||`访问密码错误`,l.style.display=`block`}})}export{ae as $,mt as A,it as B,yt as C,ht as D,Et as E,gt as F,Ee as G,Ce as H,wt as I,O as J,ye as K,ot as L,B as M,bt as N,ft as O,z as P,T as Q,Ze as R,Dt as S,Tt as T,De as U,Xe as V,we as W,M as X,A as Y,N as Z,Nt as _,Q as a,f as at,ct as b,Pi as c,s as ct,pi as d,E as et,Oi as f,Pt as g,Ft as h,Ls as i,re as it,pt as j,St as k,Fi as l,u as lt,Rt as m,oc as n,ee as nt,Ui as o,d as ot,ui as p,_e as q,ac as r,ne as rt,Wi as s,o as st,sc as t,_ as tt,Ni as u,l as ut,U as v,jt as w,V as x,st as y,Ye as z};