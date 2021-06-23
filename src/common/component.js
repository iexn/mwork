const component = (function () {
    //= include common/ext/render.js

    const component = {};

    /** 
     * 创建组件容器
     */
    component.getContainer = function () {
        let container = render.getContainer("app");
        return container;
    };

    /**
     * 获取定制数组重构方法
     */
    function getArrayArgumentations (callback) {
        const aryMethods = ['push','pop','shift','unshift','splice','sort','reverse'];
        const arrayArgumentations = [];
        aryMethods.forEach(method => {
            let original = Array.prototype[method];
            arrayArgumentations[method] = function () {
                let result = original.apply(this, arguments)
                callback && callback(method);
                return result;
            };
        });

        // 清空数组只保留项数
        arrayArgumentations.clear = function (length = 0) {
            this.length = length;
            callback && callback('clear');
            return this;
        }

        return arrayArgumentations;
    };

    /** 
     * 热更新
     * 未扩展数组中是对象，对象里面的监听情况
     */
    function hotData(data = {}, callback, deepPrefix = "") {
        let _type = util.type(data);
        if (_type == "array") {
            data.__proto__ = getArrayArgumentations(method => {
                callback && callback(deepPrefix + name, [ data ]);
            });

            for (let i = 0; i < data.length; i++) {
                data[i] = hotData(data[i], callback, deepPrefix + i + ".");
            }

            return data;
            
        } else if (_type == "object") {
            const __DATA__ = {};

            for (let name in data) {
                let data_type = util.type(data[name]);
                if (data_type == "array") {
                    __DATA__[name] = hotData(data[name], callback, deepPrefix + name + ".");
                } else if(data_type == "object") {
                    __DATA__[name] = hotData(data[name], callback, deepPrefix + name + ".");
                } else {
                    Object.defineProperty(__DATA__, name, {
                        enumerable: true,
                        get() {
                            return data[name];
                        },
                        set(val) {
                            data[name] = val;
                            callback && callback(deepPrefix + name, [ val ]);
                            return data[name];
                        }
                    });
                }
            }

            return __DATA__;
        }

        return data;
    }

    /** 
     * 热更新
     */
    component.hotData = hotData;

    /** 
     * 创建组件模型
     */
    component.create = function (template, data = {}, options = {}) {
        if (util.type(template) == "object" && template.__OBJTYPE__ == OBJTYPE) {
            return template;
        }

        let DOM;
        if (util.isDom(template)) {
            DOM = template;
        } else {
            // 处理带数据的字符串模板
            // 匹配如同 {{name}} 的字符串模板
            const reg = /\{\{(\w+)\}\}/g;
            let exec = null;
            // 依次获取匹配内容
            while(exec = reg.exec(template)) {
                // 替换掉真实数据，如果不存在数据，将替换为空字符串
                template = template.replace(new RegExp(exec[0], "g"), util.defaults(data[exec[1]], ""));
            }
    
            DOM = render.create(template);
        }
        
        let bindSet = {};

        function on(key, callback) {
            if (!bindSet.hasOwnProperty(key)) {
                bindSet[key] = [];
            }
            bindSet[key].push({
                key: key,
                callback: callback,
            });
        }

        function off(key, callback) {
            if (!bindSet.hasOwnProperty(key)) {
                return;
            }
            for (let i = bindSet[key].length - 1; i >= 0; i--) {
                if (bindSet[key][i].callback == callback) {
                    bindSet[key].splice(i, 1);
                }
            }
        }

        function trigger(key, params, defaults) {
            let isTrigger = false;

            if (bindSet.hasOwnProperty(key)) {
                bindSet[key].map(set => {
                    if (set.callback) {
                        isTrigger = true;
                        set.callback.apply(set, params);
                    }
                });
            }
            
            if (!isTrigger) {
                defaults && defaults(key, ...params);
            }
        }

        function onDataChange(name, vals) {
            callback && callback();
        }

        options = Object.assign({
            accessDom: false
        }, options);

        let dataChange = null;

        let __DATA__ = hotData(data, function (name, vals) {
            trigger("data:" + name, vals, dataChange);
        });

        let DOMMAP = {
            el: DOM,
            data: __DATA__,
            on,
            off,
            trigger,
            addEventListener: DOM.addEventListener.bind(DOM),
            querySelector: DOM.querySelector.bind(DOM),
            querySelectorAll: DOM.querySelectorAll.bind(DOM),
            appoint: function (selector, data, options={}) {
                try {
                    return component.create(DOM.querySelector(selector), data, options);
                } catch (error) {
                    if (options.error !== false) {
                        console.error("appoint未找到DOM结构：" + selector);
                    }
                    return null;
                }
            },
            empty: function () {
                DOM.innerHTML = "";
                return DOMMAP;
            },
            nfempty: function () {
                while(DOM.children.length > 1) {
                    DOM.removeChild(DOM.lastChild);
                }
                return DOMMAP;
            },
            remove: function () {
                if (DOM.parentNode) {
                    DOM.parentNode.removeChild(DOM);
                }
            },
            parent: function () {
                if (DOM.parentNode) {
                    return component.create(DOM.parentNode);
                }
            },
            onDataChange: function (callback) {
                dataChange = callback;
            },
            append: function (template) {
                let templates = Array.prototype.slice.call(arguments);

                // 如果第一个参数传了数组，后面的参数无效
                if (util.type(template) == "array") {
                    templates = template;
                }

                templates.map(template => {
                    if (typeof template == "string") {
                        template = component.create(template);
                    }

                    if (template.__OBJTYPE__ == OBJTYPE) {
                        DOM.appendChild(template.el);
                    } else {
                        trace("未识别的模板内容：template不是一个" + OBJTYPE + "对象，已被系统忽略");
                    }
                    return false;
                }).filter(dom => {
                    return dom !== false;
                }).map(dom => {
                    DOM.appendChild(dom);
                });

                return DOMMAP;
            },
        };

        DOMMAP.html = function (DM) {
            DOMMAP.empty().append(component.create(DM));
            return DOMMAP;
        }
        
        DOMMAP.text = function (text) {
            DOMMAP.empty().el.innerHTML = text;
            return DOMMAP;
        }

        Object.defineProperty(DOMMAP, "__OBJTYPE__", {
            enumerable: false,
            value: OBJTYPE,
            writable: false
        });

        // 是否将数据存入到dom上的__DATA__变量中
        if (options.accessDom) {
            DOM.__DATA__ = __DATA__;
        }

        return DOMMAP;
    }

    component.appoint = function (selector, data, options) {
        return component.create(document.querySelector(selector), data, options);
    }

    // 上传文件
    component.uploadExcel = function (callback) {
        let DOMMAP = component.create('<input type="file" accept=".xls,.xlsx"/>');
        DOMMAP.addEventListener("change", function (e) {
            let files = e.target.files;
            if (files.length == 0) {
                return;
            }
            
            callback && callback(files);
        });

        DOMMAP.el.click();

        return DOMMAP;
    }

    component.loading = function (loading_text) {
        let $loading = $(`<div class='loading-bg' loading-id='1' style="z-index:10200000"></div><div class='loadingimg' loading-id='2' style="z-index:10200000"><img src='images/loading-2.gif'><div>${loading_text || "数据加载中，请稍后..."}</div></div>`);
        $(".loading-bg").remove();
        $(".loadingimg").remove();
        $(".topbar").after($loading);
        return {
            hide: function (callback) {
                let $bg = $(".loading-bg");
                let $img = $(".loadingimg");
                $bg.fadeOut("fast");
                $img.fadeOut("fast");
                callback && callback();
            }
        };
    }

    // = block:main

    return component;
})();