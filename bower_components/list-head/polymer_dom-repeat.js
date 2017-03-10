Polymer.Templatizer = {};
Polymer({
    is: 'dom-repeat',
    extends: 'template',
    _template: null,
    
    properties: {
        items: { 
            type: Array 
        },
        as: { 
            type: String, value: 'item' 
        },
        indexAs: {
             type: String, value: 'index' 
        },
        sort: {
            type: Function, observer: '_sortChanged'
        },
        filter: {
            type: Function,
            observer: '_filterChanged'
        },
        observe: {
            type: String,
            observer: '_observeChanged'
        },
        delay: Number,
        renderedItemCount: {
            type: Number,
            notify: !Polymer.Settings.suppressTemplateNotifications,
            readOnly: true
        },
        initialCount: {
            type: Number,
            observer: '_initializeChunking'
        },
        targetFramerate: {
            type: Number,
            value: 20
        },
        notifyDomChange: { type: Boolean },
        _targetFrameTime: {
            type: Number,
            computed: '_computeFrameTime(targetFramerate)'
        }
    },
    
    behaviors: [Polymer.Templatizer],
    observers: ['_itemsChanged(items.*)'],
    created: function () {
        this._instances = [];
        this._pool = [];
        this._limit = Infinity;
        var self = this;
        this._boundRenderChunk = function () {
            self._renderChunk();    
        };
    },
    detached: function () {
        this.__isDetached = true;
        for (var i = 0; i < this._instances.length; i++) {
            this._detachInstance(i);
        }
    },
    attached: function () {
        if (this.__isDetached) {
            this.__isDetached = false;
            var parent = Polymer.dom(Polymer.dom(this).parentNode);
            for (var i = 0; i < this._instances.length; i++) {
                this._attachInstance(i, parent);
            }
        }
    },
    ready: function () {
        this._instanceProps = { __key__: true };
        this._instanceProps[this.as] = true;
        this._instanceProps[this.indexAs] = true;
        if (!this.ctor) {
            this.templatize(this);
        }
    },
    _sortChanged: function (sort) {
        var dataHost = this._getRootDataHost();
        this._sortFn = sort && (typeof sort == 'function' ? sort : function () {
            return dataHost[sort].apply(dataHost, arguments);
        });
        this._needFullRefresh = true;
        if (this.items) {
        this._debounceTemplate(this._render);
        }
    },
    _filterChanged: function (filter) {
        var dataHost = this._getRootDataHost();
        this._filterFn = filter && (typeof filter == 'function' ? filter : function () {
        return dataHost[filter].apply(dataHost, arguments);
        });
        this._needFullRefresh = true;
        if (this.items) {
        this._debounceTemplate(this._render);
        }
    },
    _computeFrameTime: function (rate) {
        return Math.ceil(1000 / rate);
    },
    _initializeChunking: function () {
        if (this.initialCount) {
        this._limit = this.initialCount;
        this._chunkCount = this.initialCount;
        this._lastChunkTime = performance.now();
        }
    },
    _tryRenderChunk: function () {
        if (this.items && this._limit < this.items.length) {
        this.debounce('renderChunk', this._requestRenderChunk);
        }
    },
    _requestRenderChunk: function () {
        requestAnimationFrame(this._boundRenderChunk);
    },
    _renderChunk: function () {
        var currChunkTime = performance.now();
        var ratio = this._targetFrameTime / (currChunkTime - this._lastChunkTime);
        this._chunkCount = Math.round(this._chunkCount * ratio) || 1;
        this._limit += this._chunkCount;
        this._lastChunkTime = currChunkTime;
        this._debounceTemplate(this._render);
    },
    _observeChanged: function () {
        this._observePaths = this.observe && this.observe.replace('.*', '.').split(' ');
    },
    _itemsChanged: function (change) {
        if (change.path == 'items') {
        if (Array.isArray(this.items)) {
        this.collection = Polymer.Collection.get(this.items);
        } else if (!this.items) {
        this.collection = null;
        } else {
        this._error(this._logf('dom-repeat', 'expected array for `items`,' + ' found', this.items));
        }
        this._keySplices = [];
        this._indexSplices = [];
        this._needFullRefresh = true;
        this._initializeChunking();
        this._debounceTemplate(this._render);
        } else if (change.path == 'items.splices') {
        this._keySplices = this._keySplices.concat(change.value.keySplices);
        this._indexSplices = this._indexSplices.concat(change.value.indexSplices);
        this._debounceTemplate(this._render);
        } else {
        var subpath = change.path.slice(6);
        this._forwardItemPath(subpath, change.value);
        this._checkObservedPaths(subpath);
        }
    },
    _checkObservedPaths: function (path) {
        if (this._observePaths) {
        path = path.substring(path.indexOf('.') + 1);
        var paths = this._observePaths;
        for (var i = 0; i < paths.length; i++) {
        if (path.indexOf(paths[i]) === 0) {
        this._needFullRefresh = true;
        if (this.delay) {
        this.debounce('render', this._render, this.delay);
        } else {
        this._debounceTemplate(this._render);
        }
        return;
        }
        }
        }
    },
    render: function () {
        this._needFullRefresh = true;
        this._debounceTemplate(this._render);
        this._flushTemplates();
    },
    _render: function () {
        if (this._needFullRefresh) {
        this._applyFullRefresh();
        this._needFullRefresh = false;
        } else if (this._keySplices.length) {
        if (this._sortFn) {
        this._applySplicesUserSort(this._keySplices);
        } else {
        if (this._filterFn) {
        this._applyFullRefresh();
        } else {
        this._applySplicesArrayOrder(this._indexSplices);
        }
        }
        } else {
        }
        this._keySplices = [];
        this._indexSplices = [];
        var keyToIdx = this._keyToInstIdx = {};
        for (var i = this._instances.length - 1; i >= 0; i--) {
        var inst = this._instances[i];
        if (inst.isPlaceholder && i < this._limit) {
        inst = this._insertInstance(i, inst.__key__);
        } else if (!inst.isPlaceholder && i >= this._limit) {
        inst = this._downgradeInstance(i, inst.__key__);
        }
        keyToIdx[inst.__key__] = i;
        if (!inst.isPlaceholder) {
        inst.__setProperty(this.indexAs, i, true);
        }
        }
        this._pool.length = 0;
        this._setRenderedItemCount(this._instances.length);
        if (!Polymer.Settings.suppressTemplateNotifications || this.notifyDomChange) {
        this.fire('dom-change');
        }
        this._tryRenderChunk();
    },
    _applyFullRefresh: function () {
        var c = this.collection;
        var keys;
        if (this._sortFn) {
        keys = c ? c.getKeys() : [];
        } else {
        keys = [];
        var items = this.items;
        if (items) {
        for (var i = 0; i < items.length; i++) {
        keys.push(c.getKey(items[i]));
        }
        }
        }
        var self = this;
        if (this._filterFn) {
        keys = keys.filter(function (a) {
        return self._filterFn(c.getItem(a));
        });
        }
        if (this._sortFn) {
        keys.sort(function (a, b) {
        return self._sortFn(c.getItem(a), c.getItem(b));
        });
        }
        for (i = 0; i < keys.length; i++) {
        var key = keys[i];
        var inst = this._instances[i];
        if (inst) {
        inst.__key__ = key;
        if (!inst.isPlaceholder && i < this._limit) {
        inst.__setProperty(this.as, c.getItem(key), true);
        }
        } else if (i < this._limit) {
        this._insertInstance(i, key);
        } else {
        this._insertPlaceholder(i, key);
        }
        }
        for (var j = this._instances.length - 1; j >= i; j--) {
        this._detachAndRemoveInstance(j);
        }
    },
    _numericSort: function (a, b) {
        return a - b;
    },
    _applySplicesUserSort: function (splices) {
        var c = this.collection;
        var keyMap = {};
        var key;
        for (var i = 0, s; i < splices.length && (s = splices[i]); i++) {
        for (var j = 0; j < s.removed.length; j++) {
        key = s.removed[j];
        keyMap[key] = keyMap[key] ? null : -1;
        }
        for (j = 0; j < s.added.length; j++) {
        key = s.added[j];
        keyMap[key] = keyMap[key] ? null : 1;
        }
        }
        var removedIdxs = [];
        var addedKeys = [];
        for (key in keyMap) {
        if (keyMap[key] === -1) {
        removedIdxs.push(this._keyToInstIdx[key]);
        }
        if (keyMap[key] === 1) {
        addedKeys.push(key);
        }
        }
        if (removedIdxs.length) {
        removedIdxs.sort(this._numericSort);
        for (i = removedIdxs.length - 1; i >= 0; i--) {
        var idx = removedIdxs[i];
        if (idx !== undefined) {
        this._detachAndRemoveInstance(idx);
        }
        }
        }
        var self = this;
        if (addedKeys.length) {
        if (this._filterFn) {
        addedKeys = addedKeys.filter(function (a) {
        return self._filterFn(c.getItem(a));
        });
        }
        addedKeys.sort(function (a, b) {
        return self._sortFn(c.getItem(a), c.getItem(b));
        });
        var start = 0;
        for (i = 0; i < addedKeys.length; i++) {
        start = this._insertRowUserSort(start, addedKeys[i]);
        }
        }
    },
    _insertRowUserSort: function (start, key) {
        var c = this.collection;
        var item = c.getItem(key);
        var end = this._instances.length - 1;
        var idx = -1;
        while (start <= end) {
        var mid = start + end >> 1;
        var midKey = this._instances[mid].__key__;
        var cmp = this._sortFn(c.getItem(midKey), item);
        if (cmp < 0) {
        start = mid + 1;
        } else if (cmp > 0) {
        end = mid - 1;
        } else {
        idx = mid;
        break;
        }
        }
        if (idx < 0) {
        idx = end + 1;
        }
        this._insertPlaceholder(idx, key);
        return idx;
    },
    _applySplicesArrayOrder: function (splices) {
        for (var i = 0, s; i < splices.length && (s = splices[i]); i++) {
        for (var j = 0; j < s.removed.length; j++) {
        this._detachAndRemoveInstance(s.index);
        }
        for (j = 0; j < s.addedKeys.length; j++) {
        this._insertPlaceholder(s.index + j, s.addedKeys[j]);
        }
        }
    },
    _detachInstance: function (idx) {
        var inst = this._instances[idx];
        if (!inst.isPlaceholder) {
        for (var i = 0; i < inst._children.length; i++) {
        var el = inst._children[i];
        Polymer.dom(inst.root).appendChild(el);
        }
        return inst;
        }
    },
    _attachInstance: function (idx, parent) {
        var inst = this._instances[idx];
        if (!inst.isPlaceholder) {
        parent.insertBefore(inst.root, this);
        }
    },
    _detachAndRemoveInstance: function (idx) {
        var inst = this._detachInstance(idx);
        if (inst) {
        this._pool.push(inst);
        }
        this._instances.splice(idx, 1);
    },
    _insertPlaceholder: function (idx, key) {
        this._instances.splice(idx, 0, {
        isPlaceholder: true,
        __key__: key
        });
    },
    _stampInstance: function (idx, key) {
        var model = { __key__: key };
        model[this.as] = this.collection.getItem(key);
        model[this.indexAs] = idx;
        return this.stamp(model);
    },
    _insertInstance: function (idx, key) {
        var inst = this._pool.pop();
        if (inst) {
        inst.__setProperty(this.as, this.collection.getItem(key), true);
        inst.__setProperty('__key__', key, true);
        } else {
        inst = this._stampInstance(idx, key);
        }
        var beforeRow = this._instances[idx + 1];
        var beforeNode = beforeRow && !beforeRow.isPlaceholder ? beforeRow._children[0] : this;
        var parentNode = Polymer.dom(this).parentNode;
        Polymer.dom(parentNode).insertBefore(inst.root, beforeNode);
        this._instances[idx] = inst;
        return inst;
    },
    _downgradeInstance: function (idx, key) {
        var inst = this._detachInstance(idx);
        if (inst) {
        this._pool.push(inst);
        }
        inst = {
        isPlaceholder: true,
        __key__: key
        };
        this._instances[idx] = inst;
        return inst;
        },
        _showHideChildren: function (hidden) {
        for (var i = 0; i < this._instances.length; i++) {
        if (!this._instances[i].isPlaceholder)
        this._instances[i]._showHideChildren(hidden);
        }
    },
    _forwardInstanceProp: function (inst, prop, value) {
        if (prop == this.as) {
        var idx;
        if (this._sortFn || this._filterFn) {
        idx = this.items.indexOf(this.collection.getItem(inst.__key__));
        } else {
        idx = inst[this.indexAs];
        }
        this.set('items.' + idx, value);
        }
        },
        _forwardInstancePath: function (inst, path, value) {
        if (path.indexOf(this.as + '.') === 0) {
        this._notifyPath('items.' + inst.__key__ + '.' + path.slice(this.as.length + 1), value);
        }
    },
    _forwardParentProp: function (prop, value) {
        var i$ = this._instances;
        for (var i = 0, inst; i < i$.length && (inst = i$[i]); i++) {
        if (!inst.isPlaceholder) {
        inst.__setProperty(prop, value, true);
        }
        }
    },
    _forwardParentPath: function (path, value) {
        var i$ = this._instances;
        for (var i = 0, inst; i < i$.length && (inst = i$[i]); i++) {
        if (!inst.isPlaceholder) {
        inst._notifyPath(path, value, true);
        }
        }
    },
    _forwardItemPath: function (path, value) {
        if (this._keyToInstIdx) {
        var dot = path.indexOf('.');
        var key = path.substring(0, dot < 0 ? path.length : dot);
        var idx = this._keyToInstIdx[key];
        var inst = this._instances[idx];
        if (inst && !inst.isPlaceholder) {
        if (dot >= 0) {
        path = this.as + '.' + path.substring(dot + 1);
        inst._notifyPath(path, value, true);
        } else {
        inst.__setProperty(this.as, value, true);
        }
        }
        }
    },
    itemForElement: function (el) {
        var instance = this.modelForElement(el);
        return instance && instance[this.as];
        },
        keyForElement: function (el) {
        var instance = this.modelForElement(el);
        return instance && instance.__key__;
    },
    indexForElement: function (el) {
        var instance = this.modelForElement(el);
        return instance && instance[this.indexAs];
    }
});