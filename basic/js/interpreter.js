/* Web BASIC 2.0 - Compiled High-Speed N88-BASIC Interpreter */
(function (global) {
  'use strict';

  var WB = global.WebBasic = global.WebBasic || {};

  function BasicRuntime(io) {
    this.io = io; // { emit, emitInline, emitSys, emitOk, emitErr, cls, gfx, audio, requestInput, getKey, waitKey, onStateChange, onAuto, onEditLine, onList, onLoadFile, onSaveFile, onShowSamples, onOpenManual, onUiSetting }
    this.program = Object.create(null); // lineNum -> source string
    this.compiledLines = Object.create(null); // lineNum -> compiled stmt list

    this.running = false;
    this.paused = false;
    this.stopRequested = false;
    this.tron = false;

    this.vars = Object.create(null);
    this.arrays = Object.create(null);
    this.userFns = Object.create(null);

    this.ops = [];
    this.lineToPc = Object.create(null);
    this.pc = 0;

    this.forStack = [];
    this.whileStack = [];
    this.repeatStack = [];
    this.gosubStack = [];

    this.dataItems = [];
    this.dataLineStart = Object.create(null);
    this.dataPtr = 0;

    this.onErrorLine = 0;
    this.errCode = 0;
    this.errLine = 0;
    this.resumePc = -1;
    this.resumeNextPc = -1;
    this.inErrorHandler = false;

    this.rngState = (Date.now() & 0xffffffff) >>> 0;
    this.lastRnd = 0.5;
    this.startTimeMs = performance.now();
    this.textCol = 0;
    this.textRow = 0;

    this._initBuiltins();
  }

  // ====== 組み込み関数テーブル ======
  BasicRuntime.prototype._initBuiltins = function () {
    var self = this;
    this.fns = {
      ABS: function (rt, x) { return Math.abs(+x); },
      INT: function (rt, x) { return Math.floor(+x); },
      FIX: function (rt, x) { return Math.trunc(+x); },
      SGN: function (rt, x) { var n = +x; return n > 0 ? 1 : (n < 0 ? -1 : 0); },
      SQR: function (rt, x) {
        var n = +x;
        if (n < 0) throw new Error('SQR の引数が負です');
        return Math.sqrt(n);
      },
      SIN: function (rt, x) { return Math.sin(+x); },
      COS: function (rt, x) { return Math.cos(+x); },
      TAN: function (rt, x) { return Math.tan(+x); },
      ATN: function (rt, x) { return Math.atan(+x); },
      EXP: function (rt, x) { return Math.exp(+x); },
      LOG: function (rt, x) {
        var n = +x;
        if (n <= 0) throw new Error('LOG の引数は正の数が必要です');
        return Math.log(n);
      },
      PI: function () { return Math.PI; },
      RAD: function (rt, x) { return (+x) * Math.PI / 180; },
      DEG: function (rt, x) { return (+x) * 180 / Math.PI; },
      MIN: function (rt) {
        var m = +arguments[1];
        for (var i = 2; i < arguments.length; i++) if (+arguments[i] < m) m = +arguments[i];
        return m;
      },
      MAX: function (rt) {
        var m = +arguments[1];
        for (var i = 2; i < arguments.length; i++) if (+arguments[i] > m) m = +arguments[i];
        return m;
      },
      CINT: function (rt, x) { return Math.round(+x); },
      CSNG: function (rt, x) { return +x; },
      CDBL: function (rt, x) { return +x; },
      CLNG: function (rt, x) { return Math.round(+x); },
      RND: function (rt, n) {
        if (n !== undefined && +n === 0) return rt.lastRnd;
        if (n !== undefined && +n < 0) {
          rt.rngState = (Math.abs(Math.floor(+n * 65536)) ^ 0x9e3779b9) >>> 0;
        }
        // Mulberry32 高速擬似乱数
        var t = rt.rngState = (rt.rngState + 0x6D2B79F5) | 0;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        rt.lastRnd = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        return rt.lastRnd;
      },

      // 文字列関数
      LEN: function (rt, s) { return String(s).length; },
      'LEFT$': function (rt, s, n) { return String(s).slice(0, Math.max(0, n | 0)); },
      'RIGHT$': function (rt, s, n) {
        var st = String(s), len = Math.max(0, n | 0);
        return len === 0 ? '' : st.slice(-len);
      },
      'MID$': function (rt, s, start, len) {
        var st = String(s);
        var idx = Math.max(0, (start | 0) - 1);
        if (len === undefined) return st.slice(idx);
        return st.slice(idx, idx + Math.max(0, len | 0));
      },
      INSTR: function (rt, a, b, c) {
        var start = 1, hay, needle;
        if (c !== undefined) {
          start = Math.max(1, a | 0);
          hay = String(b);
          needle = String(c);
        } else {
          hay = String(a);
          needle = String(b);
        }
        if (needle === '') return start <= hay.length ? start : 0;
        var found = hay.indexOf(needle, start - 1);
        return found >= 0 ? found + 1 : 0;
      },
      'CHR$': function (rt, code) { return String.fromCharCode((code | 0) & 0xffff); },
      ASC: function (rt, s) {
        var st = String(s);
        return st.length > 0 ? st.charCodeAt(0) : 0;
      },
      'STR$': function (rt, n) {
        var v = +n;
        return v >= 0 ? (' ' + String(v)) : String(v);
      },
      VAL: function (rt, s) {
        var st = String(s).trim();
        if (/^&H[0-9A-Fa-f]+$/.test(st)) return parseInt(st.slice(2), 16);
        if (/^&O[0-7]+$/.test(st)) return parseInt(st.slice(2), 8);
        if (/^&B[01]+$/.test(st)) return parseInt(st.slice(2), 2);
        var num = parseFloat(st);
        return isNaN(num) ? 0 : num;
      },
      'STRING$': function (rt, count, ch) {
        var c = Math.max(0, Math.min(10000, count | 0));
        var unit = (typeof ch === 'number') ? String.fromCharCode(ch | 0) : String(ch).charAt(0);
        return unit.repeat(c);
      },
      'SPACE$': function (rt, count) {
        return ' '.repeat(Math.max(0, Math.min(10000, count | 0)));
      },
      'HEX$': function (rt, n) { return ((n | 0) >>> 0).toString(16).toUpperCase(); },
      'OCT$': function (rt, n) { return ((n | 0) >>> 0).toString(8); },
      'BIN$': function (rt, n) { return ((n | 0) >>> 0).toString(2); },
      'UCASE$': function (rt, s) { return String(s).toUpperCase(); },
      'UPPER$': function (rt, s) { return String(s).toUpperCase(); },
      'LCASE$': function (rt, s) { return String(s).toLowerCase(); },
      'LOWER$': function (rt, s) { return String(s).toLowerCase(); },
      'TRIM$': function (rt, s) { return String(s).trim(); },

      // システム・入力・グラフィック関数
      'INKEY$': function (rt) { return rt.io.popKey(); },
      'INPUT$': function (rt, n) { return rt.io.popKeys(n | 0); },
      TIMER: function (rt) { return (performance.now() - rt.startTimeMs) / 1000; },
      'TIME$': function () {
        var d = new Date();
        return [d.getHours(), d.getMinutes(), d.getSeconds()]
          .map(function (v) { return v < 10 ? '0' + v : String(v); }).join(':');
      },
      'DATE$': function () {
        var d = new Date();
        var m = d.getMonth() + 1, day = d.getDate();
        return d.getFullYear() + '/' + (m < 10 ? '0' + m : m) + '/' + (day < 10 ? '0' + day : day);
      },
      FRE: function () { return 65536; },
      POS: function (rt) { return rt.textCol; },
      CSRLIN: function (rt) { return rt.textRow; },
      ERR: function (rt) { return rt.errCode; },
      ERL: function (rt) { return rt.errLine; },
      POINT: function (rt, x, y) { return rt.io.gfx.point(x, y); },
      SCREEN: function (rt, x, y) { return rt.io.gfx.point(x, y); },
      TAB: function (rt, n) { return { __tab: Math.max(0, n | 0) }; },
      SPC: function (rt, n) { return ' '.repeat(Math.max(0, n | 0)); },
      PEEK: function () { return 0; }
    };
  };

  BasicRuntime.prototype.callBuiltin = function (name, args) {
    var fn = this.fns[name];
    if (!fn) throw new Error('未定義の関数: ' + name);
    switch (args.length) {
      case 0: return fn(this);
      case 1: return fn(this, args[0]);
      case 2: return fn(this, args[0], args[1]);
      case 3: return fn(this, args[0], args[1], args[2]);
      default: return fn.apply(this, [this].concat(args));
    }
  };

  BasicRuntime.prototype.callUserFn = function (name, args) {
    var def = this.userFns[name];
    if (!def) throw new Error('未定義のユーザー関数: ' + name);
    if (args.length !== def.params.length) {
      throw new Error(name + ' の引数の数が一致しません');
    }
    var saved = Object.create(null);
    for (var i = 0; i < def.params.length; i++) {
      var p = def.params[i];
      if (Object.prototype.hasOwnProperty.call(this.vars, p)) {
        saved[p] = this.vars[p];
      }
      this.vars[p] = args[i];
    }
    try {
      return def.bodyFn(this);
    } finally {
      for (var j = 0; j < def.params.length; j++) {
        var pj = def.params[j];
        if (Object.prototype.hasOwnProperty.call(saved, pj)) {
          this.vars[pj] = saved[pj];
        } else {
          delete this.vars[pj];
        }
      }
    }
  };

  BasicRuntime.prototype.getVar = function (name) {
    var u = name.toUpperCase();
    if (Object.prototype.hasOwnProperty.call(this.vars, u)) return this.vars[u];
    return u.endsWith('$') ? '' : 0;
  };

  BasicRuntime.prototype.setVar = function (name, val) {
    var u = name.toUpperCase();
    if (u.endsWith('$')) {
      this.vars[u] = String(val);
    } else if (u.endsWith('%')) {
      this.vars[u] = Math.trunc(+val) | 0;
    } else {
      this.vars[u] = (typeof val === 'number') ? val : Number(val);
    }
  };

  BasicRuntime.prototype._ensureArray = function (name, dims) {
    var u = name.toUpperCase();
    var arr = this.arrays[u];
    if (!arr) {
      // DIM なしの自動確保 (各次元 0..10)
      var autoDims = dims.map(function (d) { return Math.max(11, d + 1); });
      arr = this.dimArray(u, autoDims);
    }
    return arr;
  };

  BasicRuntime.prototype.dimArray = function (name, sizes) {
    var u = name.toUpperCase();
    var total = 1;
    var strides = new Array(sizes.length);
    for (var i = sizes.length - 1; i >= 0; i--) {
      var sz = Math.max(1, (sizes[i] | 0) + 1);
      strides[i] = total;
      total *= sz;
      if (total > 2000000) throw new Error('配列サイズが大きすぎます: ' + u);
    }
    var isStr = u.endsWith('$');
    var data = isStr ? new Array(total).fill('') : new Float64Array(total);
    var entry = { sizes: sizes.map(function (s) { return (s | 0) + 1; }), strides: strides, data: data, isStr: isStr };
    this.arrays[u] = entry;
    return entry;
  };

  BasicRuntime.prototype._flatIndex = function (arr, idxs) {
    if (idxs.length !== arr.sizes.length) {
      throw new Error('配列の次元数が一致しません');
    }
    var flat = 0;
    for (var i = 0; i < idxs.length; i++) {
      var idx = idxs[i] | 0;
      if (idx < 0 || idx >= arr.sizes[i]) {
        throw new Error('配列の添字が範囲外です: ' + idx);
      }
      flat += idx * arr.strides[i];
    }
    return flat;
  };

  BasicRuntime.prototype.getArray = function (name, idxs) {
    var arr = this._ensureArray(name, idxs);
    return arr.data[this._flatIndex(arr, idxs)];
  };

  BasicRuntime.prototype.setArray = function (name, idxs, val) {
    var arr = this._ensureArray(name, idxs);
    var fi = this._flatIndex(arr, idxs);
    if (arr.isStr) arr.data[fi] = String(val);
    else if (name.endsWith('%')) arr.data[fi] = Math.trunc(+val) | 0;
    else arr.data[fi] = +val;
  };

  // ====== 構文解析ヘルパ ======
  function sortedLineNumbers(program) {
    return Object.keys(program).map(function (k) { return parseInt(k, 10); }).sort(function (a, b) { return a - b; });
  }

  BasicRuntime.prototype.sortedLines = function () {
    return sortedLineNumbers(this.program);
  };

  BasicRuntime.prototype.setLine = function (ln, body) {
    var clean = String(body || '').trim();
    if (clean === '') {
      delete this.program[ln];
      delete this.compiledLines[ln];
    } else {
      this.program[ln] = clean;
      delete this.compiledLines[ln];
    }
  };

  BasicRuntime.prototype.clearProgram = function () {
    this.program = Object.create(null);
    this.compiledLines = Object.create(null);
    this.clearVars();
  };

  BasicRuntime.prototype.clearVars = function () {
    this.vars = Object.create(null);
    this.arrays = Object.create(null);
    this.userFns = Object.create(null);
    this.forStack = [];
    this.whileStack = [];
    this.repeatStack = [];
    this.gosubStack = [];
    this.dataPtr = 0;
    this.onErrorLine = 0;
    this.errCode = 0;
    this.errLine = 0;
    this.resumePc = -1;
    this.resumeNextPc = -1;
    this.inErrorHandler = false;
  };

  // クォート外のコメント除去 (REM / ')
  function stripComments(line) {
    var s = WB.Expr.normalizeQuotes(line);
    var inQuote = false;
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (ch === '"') {
        inQuote = !inQuote;
        continue;
      }
      if (!inQuote) {
        if (ch === "'") return s.slice(0, i).trim();
        if ((ch === 'R' || ch === 'r') && s.substr(i, 3).toUpperCase() === 'REM') {
          var prevOk = (i === 0) || /[\s:]/.test(s[i - 1]);
          var nextCh = s[i + 3] || '';
          var nextOk = (nextCh === '' || /\s/.test(nextCh) || nextCh === ':');
          if (prevOk && nextOk) {
            return s.slice(0, i).trim();
          }
        }
      }
    }
    return s.trim();
  }

  // クォート・括弧外の区切り文字分割
  function splitOutside(str, sepChar) {
    var res = [];
    var inQuote = false;
    var depth = 0;
    var start = 0;
    for (var i = 0; i < str.length; i++) {
      var ch = str[i];
      if (ch === '"') inQuote = !inQuote;
      else if (!inQuote) {
        if (ch === '(') depth++;
        else if (ch === ')' && depth > 0) depth--;
        else if (ch === sepChar && depth === 0) {
          res.push(str.slice(start, i));
          start = i + 1;
        }
      }
    }
    res.push(str.slice(start));
    return res;
  }

  // IF文の THEN / ELSE をクォート外で検索
  function findKeywordOutside(str, kw) {
    var upper = str.toUpperCase();
    var inQuote = false;
    var depth = 0;
    var kwLen = kw.length;
    for (var i = 0; i <= str.length - kwLen; i++) {
      var ch = str[i];
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (!inQuote) {
        if (ch === '(') depth++;
        else if (ch === ')' && depth > 0) depth--;
        else if (depth === 0 && upper.substr(i, kwLen) === kw) {
          var prev = i === 0 ? ' ' : str[i - 1];
          var next = (i + kwLen >= str.length) ? ' ' : str[i + kwLen];
          if (/[\s):]/.test(prev) && /[\s0-9:]/.test(next)) {
            return i;
          }
        }
      }
    }
    return -1;
  }

  // 座標ペア (x1, y1)-(x2, y2) のパーサ
  function parseCoordPair(text) {
    var s = text.trim();
    var step = false;
    if (/^STEP\b/i.test(s)) {
      step = true;
      s = s.slice(4).trim();
    }
    if (s.charAt(0) === '(') {
      // 対応する ) を探す
      var depth = 0, inQ = false, closeIdx = -1;
      for (var i = 0; i < s.length; i++) {
        if (s[i] === '"') inQ = !inQ;
        else if (!inQ) {
          if (s[i] === '(') depth++;
          else if (s[i] === ')') {
            depth--;
            if (depth === 0) { closeIdx = i; break; }
          }
        }
      }
      if (closeIdx > 0) {
        var inner = s.slice(1, closeIdx);
        var parts = splitOutside(inner, ',');
        if (parts.length === 2) {
          return {
            step: step,
            xFn: WB.Expr.compile(parts[0]),
            yFn: WB.Expr.compile(parts[1]),
            rest: s.slice(closeIdx + 1).trim()
          };
        }
      }
    }
    return null;
  }

  // 代入先パース: VAR or ARR(i,j)
  function parseLValue(lhs) {
    var s = lhs.trim();
    var mArr = s.match(/^([A-Za-z_][A-Za-z0-9_]*[$%!#]?)\s*\((.+)\)$/);
    if (mArr) {
      var idxExprs = splitOutside(mArr[2], ',').map(function (p) { return WB.Expr.compile(p); });
      return { kind: 'ARR', name: mArr[1].toUpperCase(), idxFns: idxExprs };
    }
    var mVar = s.match(/^([A-Za-z_][A-Za-z0-9_]*[$%!#]?)$/);
    if (mVar) {
      return { kind: 'VAR', name: mVar[1].toUpperCase() };
    }
    return null;
  }

  // PRINT 引数リストパーサ (セミコロン・カンマ・式を順次保持)
  function parsePrintItems(argStr) {
    var items = [];
    var s = argStr.trim();
    if (!s) return { items: [], trailingSep: false };

    var inQ = false, depth = 0, start = 0;
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (ch === '"') inQ = !inQ;
      else if (!inQ) {
        if (ch === '(') depth++;
        else if (ch === ')' && depth > 0) depth--;
        else if ((ch === ';' || ch === ',') && depth === 0) {
          var part = s.slice(start, i).trim();
          if (part) items.push({ kind: 'EXPR', fn: WB.Expr.compile(part) });
          items.push({ kind: 'SEP', sep: ch });
          start = i + 1;
        }
      }
    }
    var tail = s.slice(start).trim();
    var trailingSep = false;
    if (tail) {
      items.push({ kind: 'EXPR', fn: WB.Expr.compile(tail) });
    } else if (items.length > 0 && items[items.length - 1].kind === 'SEP') {
      trailingSep = true;
    }
    return { items: items, trailingSep: trailingSep };
  }

  // DATA リテラルパーサ
  function parseDataValues(argStr) {
    var rawParts = splitOutside(argStr, ',');
    return rawParts.map(function (p) {
      var t = p.trim();
      if (t.length >= 2 && t[0] === '"' && t[t.length - 1] === '"') {
        return t.slice(1, -1);
      }
      if (t === '') return '';
      if (/^[+-]?(\d+(\.\d*)?|\.\d+)([eEdD][+-]?\d+)?$/.test(t)) {
        return parseFloat(t.replace(/[dD]/g, 'e'));
      }
      if (/^&H[0-9A-Fa-f]+$/i.test(t)) return parseInt(t.slice(2), 16);
      return t;
    });
  }

  // 単一文コンパイラ
  function compileSingleStmt(rawText, ln) {
    var raw = rawText.trim();
    if (!raw) return null;
    var m;

    // DATA (実行時はスキップ、事前収集済み)
    if (/^DATA\b/i.test(raw)) {
      return { type: 'DATA', ln: ln, values: parseDataValues(raw.slice(4)) };
    }

    // ? -> PRINT エイリアス
    if (raw[0] === '?') {
      raw = 'PRINT ' + raw.slice(1);
    }

    // PRINT USING "fmt"; ...
    m = raw.match(/^PRINT\s+USING\s+(.+?)\s*;\s*(.*)$/i);
    if (m) {
      return {
        type: 'PRINT_USING',
        ln: ln,
        fmtFn: WB.Expr.compile(m[1]),
        parsed: parsePrintItems(m[2])
      };
    }

    // PRINT
    if (/^PRINT(\s|$)/i.test(raw)) {
      var pArg = raw.replace(/^PRINT\s*/i, '');
      return { type: 'PRINT', ln: ln, parsed: parsePrintItems(pArg) };
    }

    // LOCATE x, y
    m = raw.match(/^LOCATE\s+(.+)$/i);
    if (m) {
      var lParts = splitOutside(m[1], ',');
      if (lParts.length >= 2) {
        return { type: 'LOCATE', ln: ln, xFn: WB.Expr.compile(lParts[0]), yFn: WB.Expr.compile(lParts[1]) };
      }
    }

    // CLS [n]
    m = raw.match(/^CLS(\s+(.+))?$/i);
    if (m) {
      return { type: 'CLS', ln: ln, modeFn: m[2] ? WB.Expr.compile(m[2]) : null };
    }

    // GFX ON/OFF
    m = raw.match(/^GFX\s+(ON|OFF)$/i);
    if (m) return { type: 'GFX', ln: ln, on: m[1].toUpperCase() === 'ON' };

    // SCREEN w, h  または  SCREEN mode
    m = raw.match(/^SCREEN\s+(.+)$/i);
    if (m) {
      var sParts = splitOutside(m[1], ',');
      if (sParts.length >= 2) {
        return { type: 'SCREEN_SIZE', ln: ln, wFn: WB.Expr.compile(sParts[0]), hFn: WB.Expr.compile(sParts[1]) };
      }
      return { type: 'SCREEN_MODE', ln: ln, modeFn: WB.Expr.compile(sParts[0]) };
    }

    // COLOR fg[, bg]
    m = raw.match(/^COLOR\s+(.+)$/i);
    if (m) {
      var cRaw = m[1].trim();
      // 1.4互換: "COLOR 255,0,0" (3つの数値リテラル) は RGB 指定として扱う
      if (/^\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}$/.test(cRaw)) {
        return { type: 'COLOR_LIT', ln: ln, colorStr: cRaw };
      }
      // "#rrggbb"
      if (/^#[0-9a-f]{3,6}$/i.test(cRaw)) {
        return { type: 'COLOR_LIT', ln: ln, colorStr: cRaw };
      }
      var cParts = splitOutside(cRaw, ',');
      return {
        type: 'COLOR',
        ln: ln,
        fgFn: cParts[0].trim() ? WB.Expr.compile(cParts[0]) : null,
        bgFn: (cParts.length >= 2 && cParts[1].trim()) ? WB.Expr.compile(cParts[1]) : null
      };
    }

    // BG color
    m = raw.match(/^BG\s+(.+)$/i);
    if (m) {
      var bRaw = m[1].trim();
      if (/^\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}$/.test(bRaw) || /^#[0-9a-f]{3,6}$/i.test(bRaw)) {
        return { type: 'BG_LIT', ln: ln, colorStr: bRaw };
      }
      return { type: 'BG', ln: ln, colFn: WB.Expr.compile(bRaw) };
    }

    // PALETTE idx, r, g, b  または  PALETTE idx, col
    m = raw.match(/^PALETTE\s+(.+)$/i);
    if (m) {
      var palParts = splitOutside(m[1], ',');
      if (palParts.length === 4) {
        return {
          type: 'PALETTE_RGB', ln: ln,
          idxFn: WB.Expr.compile(palParts[0]),
          rFn: WB.Expr.compile(palParts[1]),
          gFn: WB.Expr.compile(palParts[2]),
          bFn: WB.Expr.compile(palParts[3])
        };
      }
      if (palParts.length === 2) {
        return { type: 'PALETTE', ln: ln, idxFn: WB.Expr.compile(palParts[0]), colFn: WB.Expr.compile(palParts[1]) };
      }
    }

    // ALPHA val
    m = raw.match(/^ALPHA\s+(.+)$/i);
    if (m) return { type: 'ALPHA', ln: ln, aFn: WB.Expr.compile(m[1]) };

    // WINDOW [(x1,y1)-(x2,y2)]
    if (/^WINDOW$/i.test(raw)) return { type: 'WINDOW_OFF', ln: ln };
    m = raw.match(/^WINDOW\s+(.+)$/i);
    if (m) {
      var w1 = parseCoordPair(m[1]);
      if (w1 && w1.rest.charAt(0) === '-') {
        var w2 = parseCoordPair(w1.rest.slice(1));
        if (w2) {
          return { type: 'WINDOW', ln: ln, x1: w1.xFn, y1: w1.yFn, x2: w2.xFn, y2: w2.yFn };
        }
      }
    }

    // VIEW [(x1,y1)-(x2,y2)]
    if (/^VIEW$/i.test(raw)) return { type: 'VIEW_OFF', ln: ln };
    m = raw.match(/^VIEW\s+(.+)$/i);
    if (m) {
      var v1 = parseCoordPair(m[1]);
      if (v1 && v1.rest.charAt(0) === '-') {
        var v2 = parseCoordPair(v1.rest.slice(1));
        if (v2) {
          return { type: 'VIEW', ln: ln, x1: v1.xFn, y1: v1.yFn, x2: v2.xFn, y2: v2.yFn };
        }
      }
    }

    // PLOT x, y  /  PSET [STEP] (x,y)[,c]  /  PRESET
    m = raw.match(/^(PLOT|PSET|PRESET)\s+(.+)$/i);
    if (m) {
      var cmdP = m[1].toUpperCase();
      var argP = m[2].trim();
      var cp = parseCoordPair(argP);
      if (cp) {
        var colPart = cp.rest.replace(/^,/, '').trim();
        return {
          type: cmdP, ln: ln, step: cp.step,
          xFn: cp.xFn, yFn: cp.yFn,
          colFn: colPart ? WB.Expr.compile(colPart) : null
        };
      }
      var pParts = splitOutside(argP, ',');
      if (pParts.length >= 2) {
        return {
          type: cmdP, ln: ln, step: false,
          xFn: WB.Expr.compile(pParts[0]),
          yFn: WB.Expr.compile(pParts[1]),
          colFn: (pParts.length >= 3 && pParts[2].trim()) ? WB.Expr.compile(pParts[2]) : null
        };
      }
    }

    // LINE: 1) LINE x1,y1,x2,y2  2) LINE [(x1,y1)]-(x2,y2)[,c][,B|BF][,style]
    m = raw.match(/^LINE\s+(.+)$/i);
    if (m) {
      var lArg = m[1].trim();
      // N88形式 -(x2,y2) または (x1,y1)-(x2,y2)
      var fromPrev = false;
      var p1 = null;
      var restAfterP1 = lArg;
      if (lArg.charAt(0) === '-') {
        fromPrev = true;
        restAfterP1 = lArg;
      } else {
        p1 = parseCoordPair(lArg);
        if (p1) restAfterP1 = p1.rest;
      }

      if ((p1 || fromPrev) && restAfterP1.charAt(0) === '-') {
        var p2 = parseCoordPair(restAfterP1.slice(1));
        if (p2) {
          var tailParts = p2.rest.replace(/^,/, '').trim();
          var opts = tailParts ? splitOutside(tailParts, ',') : [];
          var colFn = (opts[0] && opts[0].trim()) ? WB.Expr.compile(opts[0]) : null;
          var boxMode = null;
          var dashed = false;
          for (var oi = 1; oi < opts.length; oi++) {
            var ot = opts[oi].trim().toUpperCase();
            if (ot === 'B' || ot === 'BF') boxMode = ot;
            else if (ot) dashed = true;
          }
          return {
            type: 'LINE_N88', ln: ln,
            fromPrev: fromPrev,
            step1: p1 ? p1.step : false,
            x1Fn: p1 ? p1.xFn : null,
            y1Fn: p1 ? p1.yFn : null,
            step2: p2.step,
            x2Fn: p2.xFn,
            y2Fn: p2.yFn,
            colFn: colFn,
            boxMode: boxMode,
            dashed: dashed
          };
        }
      }

      // 1.4互換 4引数以上: LINE x1,y1,x2,y2[,c]
      var l4 = splitOutside(lArg, ',');
      if (l4.length >= 4) {
        return {
          type: 'LINE_4', ln: ln,
          x1Fn: WB.Expr.compile(l4[0]), y1Fn: WB.Expr.compile(l4[1]),
          x2Fn: WB.Expr.compile(l4[2]), y2Fn: WB.Expr.compile(l4[3]),
          colFn: (l4[4] && l4[4].trim()) ? WB.Expr.compile(l4[4]) : null
        };
      }
    }

    // RECT x1,y1 TO x2,y2 [FILL]
    m = raw.match(/^RECT\s+(.+?)\s+TO\s+(.+?)(\s+FILL)?$/i);
    if (m) {
      var r1 = splitOutside(m[1], ',');
      var r2 = splitOutside(m[2], ',');
      if (r1.length >= 2 && r2.length >= 2) {
        return {
          type: 'RECT', ln: ln,
          x1Fn: WB.Expr.compile(r1[0]), y1Fn: WB.Expr.compile(r1[1]),
          x2Fn: WB.Expr.compile(r2[0]), y2Fn: WB.Expr.compile(r2[1]),
          fill: !!m[3],
          colFn: (r2[2] && r2[2].trim()) ? WB.Expr.compile(r2[2]) : null
        };
      }
    }

    // BOX x1,y1,x2,y2[,col[,fill]]
    m = raw.match(/^BOX\s+(.+)$/i);
    if (m) {
      var bx = splitOutside(m[1], ',');
      if (bx.length >= 4) {
        return {
          type: 'BOX', ln: ln,
          x1Fn: WB.Expr.compile(bx[0]), y1Fn: WB.Expr.compile(bx[1]),
          x2Fn: WB.Expr.compile(bx[2]), y2Fn: WB.Expr.compile(bx[3]),
          colFn: (bx[4] && bx[4].trim()) ? WB.Expr.compile(bx[4]) : null,
          fillFn: (bx[5] && bx[5].trim()) ? WB.Expr.compile(bx[5]) : null
        };
      }
    }

    // CIRCLE: 1) CIRCLE (cx,cy), r[,c[,start,end[,aspect[,F]]]]  2) CIRCLE cx,cy,r [FILL]
    m = raw.match(/^CIRCLE\s+(.+)$/i);
    if (m) {
      var cArg = m[1].trim();
      var cpC = parseCoordPair(cArg);
      if (cpC) {
        var cRest = cpC.rest.replace(/^,/, '').trim();
        var cOpts = splitOutside(cRest, ',');
        var fillFlag = false;
        if (cOpts.length >= 6 && /^F(ILL)?$/i.test(cOpts[5].trim())) fillFlag = true;
        else if (cOpts.length >= 2 && /\bFILL$/i.test(cOpts[cOpts.length - 1])) {
          fillFlag = true;
          cOpts[cOpts.length - 1] = cOpts[cOpts.length - 1].replace(/\s+FILL$/i, '').trim();
        }
        return {
          type: 'CIRCLE', ln: ln,
          cxFn: cpC.xFn, cyFn: cpC.yFn,
          rFn: WB.Expr.compile(cOpts[0]),
          colFn: (cOpts[1] && cOpts[1].trim()) ? WB.Expr.compile(cOpts[1]) : null,
          startFn: (cOpts[2] && cOpts[2].trim()) ? WB.Expr.compile(cOpts[2]) : null,
          endFn: (cOpts[3] && cOpts[3].trim()) ? WB.Expr.compile(cOpts[3]) : null,
          aspectFn: (cOpts[4] && cOpts[4].trim()) ? WB.Expr.compile(cOpts[4]) : null,
          fill: fillFlag
        };
      }
      var hasFill = /\s+FILL$/i.test(cArg);
      var cClean = hasFill ? cArg.replace(/\s+FILL$/i, '').trim() : cArg;
      var cParts3 = splitOutside(cClean, ',');
      if (cParts3.length >= 3) {
        return {
          type: 'CIRCLE', ln: ln,
          cxFn: WB.Expr.compile(cParts3[0]),
          cyFn: WB.Expr.compile(cParts3[1]),
          rFn: WB.Expr.compile(cParts3[2]),
          colFn: (cParts3[3] && cParts3[3].trim()) ? WB.Expr.compile(cParts3[3]) : null,
          fill: hasFill
        };
      }
    }

    // PAINT (x,y)[,fill[,border]] または PAINT x,y[,fill[,border]]
    m = raw.match(/^PAINT\s+(.+)$/i);
    if (m) {
      var ptArg = m[1].trim();
      var ptPair = parseCoordPair(ptArg);
      if (ptPair) {
        var ptOpts = splitOutside(ptPair.rest.replace(/^,/, '').trim(), ',');
        return {
          type: 'PAINT', ln: ln,
          xFn: ptPair.xFn, yFn: ptPair.yFn,
          fillFn: (ptOpts[0] && ptOpts[0].trim()) ? WB.Expr.compile(ptOpts[0]) : null,
          borderFn: (ptOpts[1] && ptOpts[1].trim()) ? WB.Expr.compile(ptOpts[1]) : null
        };
      }
      var ptParts = splitOutside(ptArg, ',');
      if (ptParts.length >= 2) {
        return {
          type: 'PAINT', ln: ln,
          xFn: WB.Expr.compile(ptParts[0]), yFn: WB.Expr.compile(ptParts[1]),
          fillFn: (ptParts[2] && ptParts[2].trim()) ? WB.Expr.compile(ptParts[2]) : null,
          borderFn: (ptParts[3] && ptParts[3].trim()) ? WB.Expr.compile(ptParts[3]) : null
        };
      }
    }

    // TRIANGLE x1,y1,x2,y2,x3,y3[,col[,fill]]
    m = raw.match(/^TRIANGLE\s+(.+)$/i);
    if (m) {
      var triArg = m[1].trim();
      var triFill = /\s+FILL$/i.test(triArg);
      if (triFill) triArg = triArg.replace(/\s+FILL$/i, '').trim();
      var tp = splitOutside(triArg, ',');
      if (tp.length >= 6) {
        return {
          type: 'TRIANGLE', ln: ln,
          pts: tp.slice(0, 6).map(function (e) { return WB.Expr.compile(e); }),
          colFn: (tp[6] && tp[6].trim()) ? WB.Expr.compile(tp[6]) : null,
          fill: triFill || (tp[7] ? tp[7].trim() === '1' : false),
          fillFn: (!triFill && tp[7] && tp[7].trim()) ? WB.Expr.compile(tp[7]) : null
        };
      }
    }

    // SYMBOL (x,y), text[, sx[, sy[, col[, rot]]]]  /  GPRINT x, y, text[, col]
    m = raw.match(/^(SYMBOL|GPRINT)\s+(.+)$/i);
    if (m) {
      var symArg = m[2].trim();
      var spPair = parseCoordPair(symArg);
      if (spPair) {
        var sRest = splitOutside(spPair.rest.replace(/^,/, '').trim(), ',');
        return {
          type: 'SYMBOL', ln: ln,
          xFn: spPair.xFn, yFn: spPair.yFn,
          txtFn: WB.Expr.compile(sRest[0] || '""'),
          sxFn: (sRest[1] && sRest[1].trim()) ? WB.Expr.compile(sRest[1]) : null,
          syFn: (sRest[2] && sRest[2].trim()) ? WB.Expr.compile(sRest[2]) : null,
          colFn: (sRest[3] && sRest[3].trim()) ? WB.Expr.compile(sRest[3]) : null,
          rotFn: (sRest[4] && sRest[4].trim()) ? WB.Expr.compile(sRest[4]) : null
        };
      }
      var gpParts = splitOutside(symArg, ',');
      if (gpParts.length >= 3) {
        return {
          type: 'SYMBOL', ln: ln,
          xFn: WB.Expr.compile(gpParts[0]), yFn: WB.Expr.compile(gpParts[1]),
          txtFn: WB.Expr.compile(gpParts[2]),
          colFn: (gpParts[3] && gpParts[3].trim()) ? WB.Expr.compile(gpParts[3]) : null,
          sxFn: null, syFn: null, rotFn: null
        };
      }
    }

    // ROLL dx, dy / GSCROLL dx, dy
    m = raw.match(/^(ROLL|GSCROLL)\s+(.+)$/i);
    if (m) {
      var rl = splitOutside(m[2], ',');
      return {
        type: 'ROLL', ln: ln,
        dxFn: WB.Expr.compile(rl[0] || '0'),
        dyFn: WB.Expr.compile(rl[1] || '0')
      };
    }

    // GSAVE id, x1, y1, x2, y2  /  GET (x1,y1)-(x2,y2), id
    m = raw.match(/^GSAVE\s+([^,]+)\s*,\s*(.+)$/i);
    if (m) {
      var gs = splitOutside(m[2], ',');
      if (gs.length >= 4) {
        return {
          type: 'GSAVE', ln: ln, id: m[1].trim(),
          x1Fn: WB.Expr.compile(gs[0]), y1Fn: WB.Expr.compile(gs[1]),
          x2Fn: WB.Expr.compile(gs[2]), y2Fn: WB.Expr.compile(gs[3])
        };
      }
    }
    m = raw.match(/^GET\s+(.+)$/i);
    if (m) {
      var g1 = parseCoordPair(m[1]);
      if (g1 && g1.rest.charAt(0) === '-') {
        var g2 = parseCoordPair(g1.rest.slice(1));
        if (g2) {
          var gid = g2.rest.replace(/^,/, '').trim();
          return { type: 'GSAVE', ln: ln, id: gid, x1Fn: g1.xFn, y1Fn: g1.yFn, x2Fn: g2.xFn, y2Fn: g2.yFn };
        }
      }
    }

    // GPUT id, x, y[, mode]  /  PUT (x,y), id[, mode]
    m = raw.match(/^GPUT\s+([^,]+)\s*,\s*(.+)$/i);
    if (m) {
      var gp = splitOutside(m[2], ',');
      if (gp.length >= 2) {
        return {
          type: 'GPUT', ln: ln, id: m[1].trim(),
          xFn: WB.Expr.compile(gp[0]), yFn: WB.Expr.compile(gp[1]),
          mode: gp[2] ? gp[2].trim().toUpperCase() : 'PSET'
        };
      }
    }
    m = raw.match(/^PUT\s+(.+)$/i);
    if (m) {
      var pp = parseCoordPair(m[1]);
      if (pp) {
        var pOpts = splitOutside(pp.rest.replace(/^,/, '').trim(), ',');
        return {
          type: 'GPUT', ln: ln, id: (pOpts[0] || '').trim(),
          xFn: pp.xFn, yFn: pp.yFn,
          mode: (pOpts[1] || 'PSET').trim().toUpperCase()
        };
      }
    }

    // BEEP / SOUND / PLAY
    if (/^BEEP$/i.test(raw)) return { type: 'BEEP', ln: ln, freqFn: null, msFn: null };
    m = raw.match(/^BEEP\s+(.+)$/i);
    if (m) {
      var bp = splitOutside(m[1], ',');
      return {
        type: 'BEEP', ln: ln,
        freqFn: WB.Expr.compile(bp[0]),
        msFn: bp[1] ? WB.Expr.compile(bp[1]) : null
      };
    }
    m = raw.match(/^SOUND\s+(.+)$/i);
    if (m) {
      var snd = splitOutside(m[1], ',');
      return {
        type: 'SOUND', ln: ln,
        freqFn: WB.Expr.compile(snd[0]),
        msFn: WB.Expr.compile(snd[1] || '120')
      };
    }
    m = raw.match(/^PLAY\s+(.+)$/i);
    if (m) return { type: 'PLAY', ln: ln, mmlFn: WB.Expr.compile(m[1]) };

    // WAIT ms / SLEEP sec / VSYNC
    m = raw.match(/^WAIT\s+(.+)$/i);
    if (m) return { type: 'WAIT', ln: ln, msFn: WB.Expr.compile(m[1]) };
    m = raw.match(/^SLEEP(\s+(.+))?$/i);
    if (m) return { type: 'SLEEP', ln: ln, secFn: m[2] ? WB.Expr.compile(m[2]) : null };
    if (/^(VSYNC|FRAME)$/i.test(raw)) return { type: 'VSYNC', ln: ln };

    // END / STOP
    if (/^END$/i.test(raw)) return { type: 'END', ln: ln };
    if (/^STOP$/i.test(raw)) return { type: 'STOP', ln: ln };

    // TRON / TROFF
    if (/^TRON$/i.test(raw)) return { type: 'TRON', ln: ln, on: true };
    if (/^TROFF$/i.test(raw)) return { type: 'TRON', ln: ln, on: false };

    // CLEAR
    if (/^CLEAR(\s+.*)?$/i.test(raw)) return { type: 'CLEAR', ln: ln };

    // RANDOMIZE [seed]
    m = raw.match(/^RANDOMIZE(\s+(.+))?$/i);
    if (m) return { type: 'RANDOMIZE', ln: ln, seedFn: m[2] ? WB.Expr.compile(m[2]) : null };

    // FOR var = start TO end [STEP step]
    m = raw.match(/^FOR\s+([A-Za-z_][A-Za-z0-9_]*[%!#]?)\s*=\s*(.+?)\s+TO\s+(.+?)(\s+STEP\s+(.+))?$/i);
    if (m) {
      return {
        type: 'FOR', ln: ln,
        varName: m[1].toUpperCase(),
        startFn: WB.Expr.compile(m[2]),
        endFn: WB.Expr.compile(m[3]),
        stepFn: m[5] ? WB.Expr.compile(m[5]) : null
      };
    }

    // NEXT [v1, v2, ...]
    m = raw.match(/^NEXT(\s+(.+))?$/i);
    if (m) {
      var varsList = m[2]
        ? splitOutside(m[2], ',').map(function (v) { return v.trim().toUpperCase(); }).filter(Boolean)
        : [];
      return { type: 'NEXT', ln: ln, vars: varsList };
    }

    // WHILE / WEND
    m = raw.match(/^WHILE\s+(.+)$/i);
    if (m) return { type: 'WHILE', ln: ln, condFn: WB.Expr.compile(m[1]) };
    if (/^WEND$/i.test(raw)) return { type: 'WEND', ln: ln };

    // REPEAT / UNTIL
    if (/^REPEAT$/i.test(raw)) return { type: 'REPEAT', ln: ln };
    m = raw.match(/^UNTIL\s+(.+)$/i);
    if (m) return { type: 'UNTIL', ln: ln, condFn: WB.Expr.compile(m[1]) };

    // GOTO / GOSUB / RETURN
    m = raw.match(/^GOTO\s+(\d+)$/i);
    if (m) return { type: 'GOTO', ln: ln, target: parseInt(m[1], 10) };

    m = raw.match(/^GOSUB\s+(\d+)$/i);
    if (m) return { type: 'GOSUB', ln: ln, target: parseInt(m[1], 10) };

    m = raw.match(/^RETURN(\s+(\d+))?$/i);
    if (m) return { type: 'RETURN', ln: ln, target: m[2] ? parseInt(m[2], 10) : 0 };

    // ON ERROR GOTO line / RESUME / ERROR code
    m = raw.match(/^ON\s+ERROR\s+GOTO\s+(\d+)$/i);
    if (m) return { type: 'ON_ERROR', ln: ln, target: parseInt(m[1], 10) };
    m = raw.match(/^RESUME(\s+(NEXT|\d+))?$/i);
    if (m) {
      var rArg = m[2] ? m[2].toUpperCase() : '0';
      return { type: 'RESUME', ln: ln, mode: rArg };
    }
    m = raw.match(/^ERROR\s+(.+)$/i);
    if (m) return { type: 'ERROR', ln: ln, codeFn: WB.Expr.compile(m[1]) };

    // ON expr GOTO/GOSUB l1, l2, ...
    m = raw.match(/^ON\s+(.+?)\s+(GOTO|GOSUB)\s+(.+)$/i);
    if (m) {
      var targets = splitOutside(m[3], ',').map(function (t) { return parseInt(t.trim(), 10); });
      return {
        type: 'ON_BRANCH', ln: ln,
        exprFn: WB.Expr.compile(m[1]),
        isGosub: m[2].toUpperCase() === 'GOSUB',
        targets: targets
      };
    }

    // DIM a(10), b$(5,5)
    m = raw.match(/^DIM\s+(.+)$/i);
    if (m) {
      var defs = splitOutside(m[1], ',').map(function (item) {
        var dm = item.trim().match(/^([A-Za-z_][A-Za-z0-9_]*[$%!#]?)\s*\((.+)\)$/);
        if (!dm) throw new Error('DIM 構文エラー: ' + item);
        return {
          name: dm[1].toUpperCase(),
          sizeFns: splitOutside(dm[2], ',').map(function (s) { return WB.Expr.compile(s); })
        };
      });
      return { type: 'DIM', ln: ln, defs: defs };
    }

    // SWAP a, b
    m = raw.match(/^SWAP\s+(.+)$/i);
    if (m) {
      var sw = splitOutside(m[1], ',');
      if (sw.length === 2) {
        var lv1 = parseLValue(sw[0]);
        var lv2 = parseLValue(sw[1]);
        if (lv1 && lv2) return { type: 'SWAP', ln: ln, a: lv1, b: lv2 };
      }
    }

    // READ var1, var2...
    m = raw.match(/^READ\s+(.+)$/i);
    if (m) {
      var rTargets = splitOutside(m[1], ',').map(function (t) {
        var lv = parseLValue(t);
        if (!lv) throw new Error('READ 変数が不正です: ' + t);
        return lv;
      });
      return { type: 'READ', ln: ln, targets: rTargets };
    }

    // RESTORE [line]
    m = raw.match(/^RESTORE(\s+(\d+))?$/i);
    if (m) return { type: 'RESTORE', ln: ln, target: m[2] ? parseInt(m[2], 10) : 0 };

    // DEF FNname(a, b) = expr
    m = raw.match(/^DEF\s+(FN[A-Za-z0-9_]*[$%!#]?)\s*(\(([^)]*)\))?\s*=\s*(.+)$/i);
    if (m) {
      var params = m[3]
        ? m[3].split(',').map(function (p) { return p.trim().toUpperCase(); }).filter(Boolean)
        : [];
      return {
        type: 'DEF_FN', ln: ln,
        name: m[1].toUpperCase(),
        params: params,
        bodyFn: WB.Expr.compile(m[4])
      };
    }

    // LINE INPUT ["prompt";] var$
    m = raw.match(/^LINE\s+INPUT\s+(?:"([^"]*)"\s*[;,]\s*)?([A-Za-z_][A-Za-z0-9_]*\$?)$/i);
    if (m) {
      return { type: 'LINE_INPUT', ln: ln, prompt: m[1] !== undefined ? m[1] : null, varName: m[2].toUpperCase() };
    }

    // INPUT ["prompt";] v1, v2...
    m = raw.match(/^INPUT\s+(?:"([^"]*)"\s*([;,])\s*)?(.+)$/i);
    if (m) {
      var inVars = splitOutside(m[3], ',').map(function (v) {
        var lv = parseLValue(v);
        if (!lv) throw new Error('INPUT 変数が不正です: ' + v);
        return lv;
      });
      return {
        type: 'INPUT', ln: ln,
        prompt: m[1] !== undefined ? m[1] : null,
        suppressQ: m[2] === ',',
        targets: inVars
      };
    }

    // MID$(var$, pos[, len]) = expr
    m = raw.match(/^MID\$\s*\(\s*([A-Za-z_][A-Za-z0-9_]*\$)\s*,\s*(.+?)(?:\s*,\s*(.+?))?\s*\)\s*=\s*(.+)$/i);
    if (m) {
      return {
        type: 'MID_ASSIGN', ln: ln,
        varName: m[1].toUpperCase(),
        posFn: WB.Expr.compile(m[2]),
        lenFn: m[3] ? WB.Expr.compile(m[3]) : null,
        valFn: WB.Expr.compile(m[4])
      };
    }

    // LET / 暗黙の代入 (var = expr / arr(i) = expr)
    var assignStr = raw.replace(/^LET\s+/i, '');
    var eqIdx = -1, inQ2 = false, depth2 = 0;
    for (var k = 0; k < assignStr.length; k++) {
      var c2 = assignStr[k];
      if (c2 === '"') inQ2 = !inQ2;
      else if (!inQ2) {
        if (c2 === '(') depth2++;
        else if (c2 === ')' && depth2 > 0) depth2--;
        else if (c2 === '=' && depth2 === 0) { eqIdx = k; break; }
      }
    }
    if (eqIdx > 0) {
      var lv = parseLValue(assignStr.slice(0, eqIdx));
      var rhs = assignStr.slice(eqIdx + 1).trim();
      if (lv && rhs) {
        return { type: 'ASSIGN', ln: ln, target: lv, valFn: WB.Expr.compile(rhs) };
      }
    }

    throw new Error('未対応の文: "' + raw + '"');
  }

  // 1行全体のコンパイル (IF文および : マルチステートメント対応)
  function compileLineStmts(lineText, ln) {
    var clean = stripComments(lineText);
    if (!clean) return [];

    // IF 文のチェック
    if (/^IF\b/i.test(clean)) {
      var thenIdx = findKeywordOutside(clean, 'THEN');
      var gotoIdx = (thenIdx < 0) ? findKeywordOutside(clean, 'GOTO') : -1;
      if (thenIdx >= 0 || gotoIdx >= 0) {
        var sepIdx = thenIdx >= 0 ? thenIdx : gotoIdx;
        var sepLen = 4;
        var condStr = clean.slice(2, sepIdx).trim();
        var afterStr = clean.slice(sepIdx + sepLen).trim();
        var elseIdx = findKeywordOutside(afterStr, 'ELSE');
        var thenPart = elseIdx >= 0 ? afterStr.slice(0, elseIdx).trim() : afterStr;
        var elsePart = elseIdx >= 0 ? afterStr.slice(elseIdx + 4).trim() : '';

        function compileBranch(part) {
          if (!part) return [];
          if (/^\d+$/.test(part)) return [{ type: 'GOTO', ln: ln, target: parseInt(part, 10) }];
          return compileLineStmts(part, ln);
        }

        return [{
          type: 'IF',
          ln: ln,
          condFn: WB.Expr.compile(condStr),
          thenOps: compileBranch(thenPart),
          elseOps: compileBranch(elsePart)
        }];
      }
    }

    // ':' で複数文を分割
    var chunks = splitOutside(clean, ':');
    var result = [];
    for (var i = 0; i < chunks.length; i++) {
      var sub = chunks[i].trim();
      if (!sub) continue;
      if (/^IF\b/i.test(sub)) {
        // IF以降を残り全て結合してIFとして再帰コンパイル
        var restIf = chunks.slice(i).join(':').trim();
        var ifOps = compileLineStmts(restIf, ln);
        for (var j = 0; j < ifOps.length; j++) result.push(ifOps[j]);
        break;
      }
      var op = compileSingleStmt(sub, ln);
      if (op) result.push(op);
    }
    return result;
  }

  // プログラム全体をフラットな命令配列にビルド
  BasicRuntime.prototype.buildProgram = function () {
    var lines = this.sortedLines();
    var ops = [];
    var lineToPc = Object.create(null);
    var dataItems = [];
    var dataLineStart = Object.create(null);

    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      var compiled = this.compiledLines[ln];
      if (!compiled) {
        compiled = compileLineStmts(this.program[ln], ln);
        this.compiledLines[ln] = compiled;
      }
      lineToPc[ln] = ops.length;
      dataLineStart[ln] = dataItems.length;

      for (var j = 0; j < compiled.length; j++) {
        var st = compiled[j];
        if (st.type === 'DATA') {
          for (var d = 0; d < st.values.length; d++) {
            dataItems.push(st.values[d]);
          }
        }
        ops.push(st);
      }
    }

    // WHILE <-> WEND, REPEAT <-> UNTIL ペアリングの事前リンク
    var wStack = [];
    var rStack = [];
    for (var pc = 0; pc < ops.length; pc++) {
      var op = ops[pc];
      if (op.type === 'WHILE') {
        wStack.push(pc);
      } else if (op.type === 'WEND') {
        if (wStack.length === 0) throw new Error('WEND に対応する WHILE がありません (Line ' + op.ln + ')');
        var wPc = wStack.pop();
        op.whilePc = wPc;
        ops[wPc].endPc = pc + 1;
      } else if (op.type === 'REPEAT') {
        rStack.push(pc);
      } else if (op.type === 'UNTIL') {
        if (rStack.length === 0) throw new Error('UNTIL に対応する REPEAT がありません (Line ' + op.ln + ')');
        op.repeatPc = rStack.pop();
      }
    }
    if (wStack.length > 0) throw new Error('WHILE に対応する WEND がありません (Line ' + ops[wStack[0]].ln + ')');
    if (rStack.length > 0) throw new Error('REPEAT に対応する UNTIL がありません (Line ' + ops[rStack[0]].ln + ')');

    this.ops = ops;
    this.lineToPc = lineToPc;
    this.dataItems = dataItems;
    this.dataLineStart = dataLineStart;
  };

  BasicRuntime.prototype._readLValue = function (lv) {
    if (lv.kind === 'VAR') return this.getVar(lv.name);
    var idxs = new Array(lv.idxFns.length);
    for (var i = 0; i < lv.idxFns.length; i++) idxs[i] = lv.idxFns[i](this) | 0;
    return this.getArray(lv.name, idxs);
  };

  BasicRuntime.prototype._writeLValue = function (lv, val) {
    if (lv.kind === 'VAR') {
      this.setVar(lv.name, val);
    } else {
      var idxs = new Array(lv.idxFns.length);
      for (var i = 0; i < lv.idxFns.length; i++) idxs[i] = lv.idxFns[i](this) | 0;
      this.setArray(lv.name, idxs, val);
    }
  };

  // PRINT USING 書式整形
  function formatUsing(fmt, values) {
    var out = '';
    var vi = 0;
    var i = 0;
    while (i < fmt.length) {
      var ch = fmt[i];
      if ((ch === '#' || ch === '+' || ch === '-' || ch === '$') && i < fmt.length) {
        var m = fmt.slice(i).match(/^(\$\$|\+|-)?([#,]+)(\.(#+))?(\+|-)?/);
        if (m && m[2]) {
          var token = m[0];
          var val = vi < values.length ? Number(values[vi++]) : 0;
          var decimals = m[4] ? m[4].length : 0;
          var hasComma = m[2].indexOf(',') >= 0;
          var isNeg = val < 0;
          var absStr = Math.abs(val).toFixed(decimals);
          var parts = absStr.split('.');
          if (hasComma) {
            parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          }
          var numStr = parts.length > 1 ? (parts[0] + '.' + parts[1]) : parts[0];
          var prefix = (m[1] === '$$') ? '$' : '';
          var sign = isNeg ? '-' : (m[1] === '+' || m[5] === '+' ? '+' : '');
          var formatted = sign + prefix + numStr;
          while (formatted.length < token.length) formatted = ' ' + formatted;
          out += formatted;
          i += token.length;
          continue;
        }
      }
      if (ch === '&') {
        out += vi < values.length ? String(values[vi++]) : '';
        i++;
        continue;
      }
      if (ch === '!') {
        out += vi < values.length ? String(values[vi++]).charAt(0) : '';
        i++;
        continue;
      }
      if (ch === '\\') {
        var endB = fmt.indexOf('\\', i + 1);
        if (endB > i) {
          var width = endB - i + 1;
          var sv = vi < values.length ? String(values[vi++]) : '';
          out += sv.slice(0, width).padEnd(width, ' ');
          i = endB + 1;
          continue;
        }
      }
      out += ch;
      i++;
    }
    return out;
  }

  // 単一命令実行 (同期完了なら undefined / nextPc、非同期なら Promise を返す)
  BasicRuntime.prototype._execOp = function (op, currentPc) {
    var io = this.io;
    var gfx = io.gfx;
    var audio = io.audio;

    switch (op.type) {
      case 'DATA':
        return currentPc + 1;

      case 'ASSIGN':
        this._writeLValue(op.target, op.valFn(this));
        return currentPc + 1;

      case 'MID_ASSIGN': {
        var orig = String(this.getVar(op.varName));
        var pos = Math.max(1, op.posFn(this) | 0) - 1;
        var rep = String(op.valFn(this));
        var maxLen = op.lenFn ? Math.max(0, op.lenFn(this) | 0) : rep.length;
        var seg = rep.slice(0, Math.min(maxLen, Math.max(0, orig.length - pos)));
        if (pos < orig.length) {
          this.setVar(op.varName, orig.slice(0, pos) + seg + orig.slice(pos + seg.length));
        }
        return currentPc + 1;
      }

      case 'PRINT': {
        var line = '';
        var col = this.textCol;
        var items = op.parsed.items;
        for (var i = 0; i < items.length; i++) {
          var it = items[i];
          if (it.kind === 'EXPR') {
            var v = it.fn(this);
            if (v && typeof v === 'object' && v.__tab !== undefined) {
              var targetCol = v.__tab;
              if (targetCol > col) {
                var spaces = ' '.repeat(targetCol - col);
                line += spaces;
                col = targetCol;
              }
            } else {
              var s = (typeof v === 'number' && !Object.is(v, -0)) ? String(v) : String(v);
              line += s;
              col += s.length;
            }
          } else if (it.sep === ',') {
            var nextZone = ((Math.floor(col / 14) + 1) * 14);
            var pad = Math.max(1, nextZone - col);
            line += ' '.repeat(pad);
            col += pad;
          }
        }
        if (gfx.cursor) {
          gfx.gPrint(line);
          this.textCol = 0;
        } else if (op.parsed.trailingSep) {
          io.emitInline(line);
          this.textCol = col;
        } else {
          io.emit(line);
          this.textCol = 0;
          this.textRow++;
        }
        return currentPc + 1;
      }

      case 'PRINT_USING': {
        var fmt = String(op.fmtFn(this));
        var vals = [];
        for (var ui = 0; ui < op.parsed.items.length; ui++) {
          if (op.parsed.items[ui].kind === 'EXPR') {
            vals.push(op.parsed.items[ui].fn(this));
          }
        }
        var formatted = formatUsing(fmt, vals);
        if (gfx.cursor) {
          gfx.gPrint(formatted);
        } else if (op.parsed.trailingSep) {
          io.emitInline(formatted);
        } else {
          io.emit(formatted);
        }
        return currentPc + 1;
      }

      case 'LOCATE':
        gfx.cursor = { x: op.xFn(this), y: op.yFn(this) };
        this.textCol = Math.max(0, gfx.cursor.x | 0);
        this.textRow = Math.max(0, gfx.cursor.y | 0);
        return currentPc + 1;

      case 'CLS': {
        var mode = op.modeFn ? (op.modeFn(this) | 0) : 1;
        if (mode === 2) gfx.cls();
        else if (mode === 3) { io.cls(); gfx.cls(); this.textCol = 0; this.textRow = 0; }
        else { io.cls(); this.textCol = 0; this.textRow = 0; }
        return currentPc + 1;
      }

      case 'GFX':
        gfx.setVisible(op.on);
        return currentPc + 1;

      case 'SCREEN_SIZE':
        gfx.resize(op.wFn(this), op.hFn(this));
        return currentPc + 1;

      case 'SCREEN_MODE': {
        var sm = op.modeFn(this) | 0;
        if (sm === 0) { gfx.setVisible(false); }
        else if (sm === 1) { gfx.setVisible(true); gfx.resize(320, 200); }
        else if (sm === 2) { gfx.setVisible(true); gfx.resize(640, 200); }
        else if (sm === 3) { gfx.setVisible(true); gfx.resize(640, 400); }
        else { gfx.setVisible(true); gfx.resize(640, 480); }
        return currentPc + 1;
      }

      case 'COLOR_LIT':
        gfx.setPenColor(op.colorStr);
        return currentPc + 1;

      case 'COLOR':
        if (op.fgFn) gfx.setPenColor(op.fgFn(this));
        if (op.bgFn) gfx.setBgColor(op.bgFn(this));
        return currentPc + 1;

      case 'BG_LIT':
        gfx.setBgColor(op.colorStr);
        return currentPc + 1;

      case 'BG':
        gfx.setBgColor(op.colFn(this));
        return currentPc + 1;

      case 'PALETTE_RGB': {
        var r = Math.max(0, Math.min(255, op.rFn(this) | 0));
        var g0 = Math.max(0, Math.min(255, op.gFn(this) | 0));
        var b = Math.max(0, Math.min(255, op.bFn(this) | 0));
        gfx.setPalette(op.idxFn(this), 'rgb(' + r + ',' + g0 + ',' + b + ')');
        return currentPc + 1;
      }

      case 'PALETTE':
        gfx.setPalette(op.idxFn(this), op.colFn(this));
        return currentPc + 1;

      case 'ALPHA':
        gfx.setAlpha(op.aFn(this));
        return currentPc + 1;

      case 'WINDOW':
        gfx.setWindow(op.x1(this), op.y1(this), op.x2(this), op.y2(this));
        return currentPc + 1;

      case 'WINDOW_OFF':
        gfx.clearWindow();
        return currentPc + 1;

      case 'VIEW':
        gfx.setView(op.x1(this), op.y1(this), op.x2(this), op.y2(this));
        return currentPc + 1;

      case 'VIEW_OFF':
        gfx.clearView();
        return currentPc + 1;

      case 'PLOT':
      case 'PSET':
        gfx.plot(op.xFn(this), op.yFn(this), op.colFn ? op.colFn(this) : undefined, op.step);
        return currentPc + 1;

      case 'PRESET':
        gfx.preset(op.xFn(this), op.yFn(this), op.colFn ? op.colFn(this) : undefined, op.step);
        return currentPc + 1;

      case 'LINE_4':
        gfx.line(op.x1Fn(this), op.y1Fn(this), op.x2Fn(this), op.y2Fn(this), op.colFn ? op.colFn(this) : undefined);
        return currentPc + 1;

      case 'LINE_N88': {
        var lx1 = op.fromPrev ? gfx.lastX : (op.step1 ? gfx.lastX + op.x1Fn(this) : op.x1Fn(this));
        var ly1 = op.fromPrev ? gfx.lastY : (op.step1 ? gfx.lastY + op.y1Fn(this) : op.y1Fn(this));
        var lx2 = op.step2 ? (lx1 + op.x2Fn(this)) : op.x2Fn(this);
        var ly2 = op.step2 ? (ly1 + op.y2Fn(this)) : op.y2Fn(this);
        gfx.line(lx1, ly1, lx2, ly2, op.colFn ? op.colFn(this) : undefined, op.boxMode, op.dashed);
        return currentPc + 1;
      }

      case 'RECT':
        gfx.rect(op.x1Fn(this), op.y1Fn(this), op.x2Fn(this), op.y2Fn(this), op.fill, op.colFn ? op.colFn(this) : undefined);
        return currentPc + 1;

      case 'BOX':
        gfx.rect(
          op.x1Fn(this), op.y1Fn(this), op.x2Fn(this), op.y2Fn(this),
          op.fillFn ? !!op.fillFn(this) : false,
          op.colFn ? op.colFn(this) : undefined
        );
        return currentPc + 1;

      case 'CIRCLE':
        gfx.circle(
          op.cxFn(this), op.cyFn(this), op.rFn(this),
          op.fill,
          op.colFn ? op.colFn(this) : undefined,
          op.startFn ? op.startFn(this) : undefined,
          op.endFn ? op.endFn(this) : undefined,
          op.aspectFn ? op.aspectFn(this) : undefined
        );
        return currentPc + 1;

      case 'PAINT':
        gfx.paint(
          op.xFn(this), op.yFn(this),
          op.fillFn ? op.fillFn(this) : undefined,
          op.borderFn ? op.borderFn(this) : undefined
        );
        return currentPc + 1;

      case 'TRIANGLE':
        gfx.triangle(
          op.pts[0](this), op.pts[1](this), op.pts[2](this),
          op.pts[3](this), op.pts[4](this), op.pts[5](this),
          op.fillFn ? !!op.fillFn(this) : op.fill,
          op.colFn ? op.colFn(this) : undefined
        );
        return currentPc + 1;

      case 'SYMBOL':
        gfx.symbol(
          op.xFn(this), op.yFn(this), op.txtFn(this),
          op.sxFn ? op.sxFn(this) : 1,
          op.syFn ? op.syFn(this) : undefined,
          op.colFn ? op.colFn(this) : undefined,
          op.rotFn ? op.rotFn(this) : 0
        );
        return currentPc + 1;

      case 'ROLL':
        gfx.roll(op.dxFn(this), op.dyFn(this));
        return currentPc + 1;

      case 'GSAVE':
        gfx.saveSprite(op.id, op.x1Fn(this), op.y1Fn(this), op.x2Fn(this), op.y2Fn(this));
        return currentPc + 1;

      case 'GPUT':
        gfx.putSprite(op.id, op.xFn(this), op.yFn(this), op.mode);
        return currentPc + 1;

      case 'BEEP':
        audio.beep(op.freqFn ? op.freqFn(this) : 880, op.msFn ? op.msFn(this) : 120);
        return currentPc + 1;

      case 'SOUND':
        audio.tone(op.freqFn(this), op.msFn(this), 0.08, 'square', 0);
        return currentPc + 1;

      case 'PLAY':
        audio.playMML(op.mmlFn(this));
        return currentPc + 1;

      case 'WAIT': {
        var ms = Math.max(0, op.msFn(this) | 0);
        return new Promise(function (resolve) { setTimeout(function () { resolve(currentPc + 1); }, ms); });
      }

      case 'SLEEP': {
        var sec = op.secFn ? Math.max(0, +op.secFn(this)) : 1;
        return new Promise(function (resolve) { setTimeout(function () { resolve(currentPc + 1); }, sec * 1000); });
      }

      case 'VSYNC':
        return new Promise(function (resolve) {
          requestAnimationFrame(function () { resolve(currentPc + 1); });
        });

      case 'END':
        this.running = false;
        this.paused = false;
        return this.ops.length;

      case 'STOP':
        this.running = false;
        this.paused = true;
        this.pc = currentPc + 1;
        io.emitSys('BREAK IN ' + op.ln);
        return this.ops.length;

      case 'TRON':
        this.tron = op.on;
        return currentPc + 1;

      case 'CLEAR':
        this.clearVars();
        return currentPc + 1;

      case 'RANDOMIZE': {
        var seed = op.seedFn ? (op.seedFn(this) | 0) : (Date.now() & 0xffffffff);
        this.rngState = seed >>> 0;
        return currentPc + 1;
      }

      case 'FOR': {
        var startV = +op.startFn(this);
        var endV = +op.endFn(this);
        var stepV = op.stepFn ? +op.stepFn(this) : 1;
        this.setVar(op.varName, startV);
        this.forStack.push({
          varName: op.varName,
          to: endV,
          step: stepV,
          bodyPc: currentPc + 1
        });
        return currentPc + 1;
      }

      case 'NEXT': {
        var varsList = op.vars.length ? op.vars : [null];
        for (var ni = 0; ni < varsList.length; ni++) {
          if (this.forStack.length === 0) throw new Error('対応する FOR がありません');
          var top = this.forStack[this.forStack.length - 1];
          if (varsList[ni] && varsList[ni] !== top.varName) {
            throw new Error('NEXT の変数名が一致しません: ' + varsList[ni]);
          }
          var nextVal = this.getVar(top.varName) + top.step;
          this.setVar(top.varName, nextVal);
          var cont = (top.step >= 0) ? (nextVal <= top.to + 1e-12) : (nextVal >= top.to - 1e-12);
          if (cont) return top.bodyPc;
          this.forStack.pop();
        }
        return currentPc + 1;
      }

      case 'WHILE':
        if (op.condFn(this)) return currentPc + 1;
        return op.endPc;

      case 'WEND':
        return op.whilePc;

      case 'REPEAT':
        return currentPc + 1;

      case 'UNTIL':
        if (!op.condFn(this)) return op.repeatPc + 1;
        return currentPc + 1;

      case 'GOTO': {
        var gPc = this.lineToPc[op.target];
        if (gPc === undefined) throw new Error('GOTO 先の行がありません: ' + op.target);
        return gPc;
      }

      case 'GOSUB': {
        var gsPc = this.lineToPc[op.target];
        if (gsPc === undefined) throw new Error('GOSUB 先の行がありません: ' + op.target);
        this.gosubStack.push(currentPc + 1);
        return gsPc;
      }

      case 'RETURN': {
        if (this.gosubStack.length === 0) throw new Error('RETURN に対応する GOSUB がありません');
        var retPc = this.gosubStack.pop();
        if (op.target > 0) {
          var rtPc = this.lineToPc[op.target];
          if (rtPc === undefined) throw new Error('RETURN 先の行がありません: ' + op.target);
          return rtPc;
        }
        return retPc;
      }

      case 'ON_BRANCH': {
        var idx = op.exprFn(this) | 0;
        if (idx >= 1 && idx <= op.targets.length) {
          var tgt = op.targets[idx - 1];
          var tPc = this.lineToPc[tgt];
          if (tPc === undefined) throw new Error('分岐先の行がありません: ' + tgt);
          if (op.isGosub) this.gosubStack.push(currentPc + 1);
          return tPc;
        }
        return currentPc + 1;
      }

      case 'ON_ERROR':
        this.onErrorLine = op.target;
        return currentPc + 1;

      case 'RESUME': {
        if (!this.inErrorHandler && this.resumePc < 0) throw new Error('RESUME はエラー処理内でのみ使用できます');
        this.inErrorHandler = false;
        if (op.mode === 'NEXT') return this.resumeNextPc;
        if (op.mode === '0') return this.resumePc;
        var rLine = parseInt(op.mode, 10);
        var rPc = this.lineToPc[rLine];
        if (rPc === undefined) throw new Error('RESUME 先の行がありません: ' + rLine);
        return rPc;
      }

      case 'ERROR':
        throw new Error('USER ERROR ' + (op.codeFn(this) | 0));

      case 'DIM': {
        for (var di = 0; di < op.defs.length; di++) {
          var d = op.defs[di];
          var sizes = d.sizeFns.map(function (fn) { return fn(this) | 0; }, this);
          this.dimArray(d.name, sizes);
        }
        return currentPc + 1;
      }

      case 'SWAP': {
        var va = this._readLValue(op.a);
        var vb = this._readLValue(op.b);
        this._writeLValue(op.a, vb);
        this._writeLValue(op.b, va);
        return currentPc + 1;
      }

      case 'READ': {
        for (var ri = 0; ri < op.targets.length; ri++) {
          if (this.dataPtr >= this.dataItems.length) throw new Error('OUT OF DATA');
          this._writeLValue(op.targets[ri], this.dataItems[this.dataPtr++]);
        }
        return currentPc + 1;
      }

      case 'RESTORE': {
        if (op.target === 0) {
          this.dataPtr = 0;
        } else {
          if (this.dataLineStart[op.target] === undefined) {
            throw new Error('RESTORE 先の行がありません: ' + op.target);
          }
          this.dataPtr = this.dataLineStart[op.target];
        }
        return currentPc + 1;
      }

      case 'DEF_FN':
        this.userFns[op.name] = { params: op.params, bodyFn: op.bodyFn };
        return currentPc + 1;

      case 'IF': {
        var branch = op.condFn(this) ? op.thenOps : op.elseOps;
        if (!branch || branch.length === 0) return currentPc + 1;
        var self = this;
        var execBranch = function (startIdx) {
          for (var bi = startIdx; bi < branch.length; bi++) {
            var res = self._execOp(branch[bi], currentPc);
            if (res && typeof res.then === 'function') {
              return res.then(function (rPc) {
                if (rPc !== currentPc + 1) return rPc;
                return execBranch(bi + 1);
              });
            }
            if (res !== currentPc + 1) return res;
          }
          return currentPc + 1;
        };
        return execBranch(0);
      }

      case 'LINE_INPUT': {
        var selfLI = this;
        var prStr = op.prompt !== null ? op.prompt : '? ';
        return io.requestInput(prStr).then(function (userText) {
          selfLI.setVar(op.varName, userText);
          return currentPc + 1;
        });
      }

      case 'INPUT': {
        var selfIn = this;
        var promptTxt = op.prompt !== null ? (op.prompt + (op.suppressQ ? '' : '? ')) : '? ';
        return io.requestInput(promptTxt).then(function (userText) {
          var vals = splitOutside(userText, ',');
          for (var ti = 0; ti < op.targets.length; ti++) {
            var lv = op.targets[ti];
            var rawVal = (vals[ti] !== undefined) ? vals[ti].trim() : '';
            var isStr = lv.name.endsWith('$');
            if (isStr) {
              if (/^".*"$/.test(rawVal)) rawVal = rawVal.slice(1, -1);
              selfIn._writeLValue(lv, rawVal);
            } else {
              var num = rawVal === '' ? 0 : Number(rawVal);
              selfIn._writeLValue(lv, isNaN(num) ? 0 : num);
            }
          }
          return currentPc + 1;
        });
      }
    }
    return currentPc + 1;
  };

  // メイン実行ループ (タイムスライス方式で超高速＋非ブロッキング)
  BasicRuntime.prototype._runLoop = async function (startPc) {
    var io = this.io;
    this.running = true;
    this.paused = false;
    this.stopRequested = false;
    this.pc = startPc;
    io.onStateChange('running');

    var lastTraceLn = -1;
    var yieldTick = function () {
      return new Promise(function (resolve) { setTimeout(resolve, 0); });
    };

    try {
      while (this.running && !this.stopRequested && this.pc < this.ops.length) {
        var sliceStart = performance.now();
        var count = 0;

        while (this.running && !this.stopRequested && this.pc < this.ops.length) {
          var op = this.ops[this.pc];
          if (this.tron && op.ln !== lastTraceLn) {
            lastTraceLn = op.ln;
            io.emitInline('[' + op.ln + ']');
          }

          try {
            var next = this._execOp(op, this.pc);
            if (next && typeof next.then === 'function') {
              this.pc = await next;
              break; // 非同期完了後は外側の時間管理から再開
            }
            this.pc = next;
          } catch (err) {
            if (this.onErrorLine > 0 && !this.inErrorHandler && this.lineToPc[this.onErrorLine] !== undefined) {
              this.errCode = 5;
              this.errLine = op.ln;
              this.resumePc = this.pc;
              this.resumeNextPc = this.pc + 1;
              this.inErrorHandler = true;
              this.pc = this.lineToPc[this.onErrorLine];
            } else {
              err._basicLine = op.ln;
              throw err;
            }
          }

          count++;
          if ((count & 1023) === 0 && (performance.now() - sliceStart) >= 14) {
            await yieldTick();
            break;
          }
        }
      }

      if (this.stopRequested) {
        this.paused = true;
        io.emitSys('BREAK');
      }
    } catch (e) {
      var lnInfo = e._basicLine !== undefined ? (' (Line ' + e._basicLine + ')') : '';
      io.emitErr((e.message || String(e)) + lnInfo);
      this.paused = false;
    } finally {
      this.running = false;
      io.onStateChange(this.paused ? 'paused' : 'ready');
      if (!this.paused) io.emitSys('READY.');
    }
  };

  BasicRuntime.prototype.run = async function (startLine) {
    if (this.running) {
      this.io.emitErr('すでに実行中です');
      return;
    }
    var lines = this.sortedLines();
    if (lines.length === 0) {
      this.io.emitErr('プログラムがありません');
      return;
    }
    try {
      this.clearVars();
      this.buildProgram();
    } catch (e) {
      this.io.emitErr(e.message || String(e));
      return;
    }

    var startPc = 0;
    if (startLine !== undefined && startLine !== null) {
      if (this.lineToPc[startLine] === undefined) {
        this.io.emitErr('指定行が見つかりません: ' + startLine);
        return;
      }
      startPc = this.lineToPc[startLine];
    }

    this.io.emitSys('RUN');
    await this._runLoop(startPc);
  };

  BasicRuntime.prototype.cont = async function () {
    if (this.running) return;
    if (!this.paused || this.pc >= this.ops.length) {
      this.io.emitErr('再開できません (CONT不可)');
      return;
    }
    this.io.emitSys('CONT');
    await this._runLoop(this.pc);
  };

  BasicRuntime.prototype.stop = function () {
    if (this.running) {
      this.stopRequested = true;
      this.io.audio.stopAll();
      this.io.cancelInput();
    }
  };

  // ダイレクトコマンド / 1行即実行
  BasicRuntime.prototype.execCommand = async function (line) {
    var io = this.io;
    var s = WB.Expr.normalizeQuotes(line || '').trim();
    if (!s) return;

    // 行番号付き登録 / 削除
    var mLine = s.match(/^(\d+)\s*(.*)$/);
    if (mLine) {
      var ln = parseInt(mLine[1], 10);
      var body = (mLine[2] || '').trim();
      var had = Object.prototype.hasOwnProperty.call(this.program, ln);
      this.setLine(ln, body);
      if (body === '') {
        if (had) io.emitOk('削除: ' + ln);
      } else {
        io.emitOk('登録: ' + ln + ' ' + body);
      }
      return;
    }

    var lower = s.toLowerCase();
    var m;

    // RUN [line]
    m = s.match(/^RUN(\s+(\d+))?$/i);
    if (m) {
      await this.run(m[2] ? parseInt(m[2], 10) : null);
      return;
    }

    if (lower === 'cont') {
      await this.cont();
      return;
    }

    if (lower === 'new') {
      this.clearProgram();
      io.gfx.reset();
      io.emitOk('消去');
      return;
    }

    // LIST / LLIST [start][-end]
    m = s.match(/^L?LIST(\s+(\d+)?(\s*-\s*(\d+)?)?)?$/i);
    if (m) {
      var lines = this.sortedLines();
      if (lines.length === 0) { io.emitSys('(プログラムなし)'); return; }
      var start = m[2] ? parseInt(m[2], 10) : 0;
      var hasDash = !!m[3];
      var end = m[4] ? parseInt(m[4], 10) : (hasDash ? Infinity : (m[2] ? start : Infinity));
      for (var i = 0; i < lines.length; i++) {
        var lnum = lines[i];
        if (lnum >= start && lnum <= end) {
          io.emit(lnum + ' ' + this.program[lnum]);
        }
      }
      return;
    }

    // DEL / DELETE start[-end]
    m = s.match(/^(DEL|DELETE)\s+(\d+)(\s*-\s*(\d+))?$/i);
    if (m) {
      var dStart = parseInt(m[2], 10);
      var dEnd = m[4] ? parseInt(m[4], 10) : dStart;
      var delCount = 0;
      var all = this.sortedLines();
      for (var di = 0; di < all.length; di++) {
        if (all[di] >= dStart && all[di] <= dEnd) {
          this.setLine(all[di], '');
          delCount++;
        }
      }
      if (delCount > 0) io.emitOk(delCount + ' 行削除');
      else io.emitSys('該当行はありません');
      return;
    }

    // EDIT line
    m = s.match(/^EDIT\s+(\d+)$/i);
    if (m) {
      var eln = parseInt(m[1], 10);
      if (!Object.prototype.hasOwnProperty.call(this.program, eln)) {
        io.emitErr('行 ' + eln + ' はありません');
      } else {
        io.onEditLine(eln + ' ' + this.program[eln]);
      }
      return;
    }

    // AUTO [start[,step]]
    m = s.match(/^AUTO(\s+(\d+)(\s*,\s*(\d+))?)?$/i);
    if (m) {
      var aStart = m[2] ? parseInt(m[2], 10) : 10;
      var aStep = m[4] ? parseInt(m[4], 10) : 10;
      io.onAuto(aStart, aStep);
      return;
    }

    // RENUM [start[,step]]
    m = s.match(/^RENUM(\s+(\d+)(\s*,\s*(\d+))?)?$/i);
    if (m) {
      var rStart = m[2] ? parseInt(m[2], 10) : 10;
      var rStep = m[4] ? parseInt(m[4], 10) : 10;
      var rLines = this.sortedLines();
      if (rLines.length === 0) { io.emitErr('プログラムがありません'); return; }
      var map = Object.create(null);
      var cur = rStart;
      for (var ri = 0; ri < rLines.length; ri++) {
        map[rLines[ri]] = cur;
        cur += rStep;
      }
      var newProg = Object.create(null);
      for (var rj = 0; rj < rLines.length; rj++) {
        var oldLn = rLines[rj];
        var newLn = map[oldLn];
        var code = this.program[oldLn];
        code = code.replace(/\b(GOTO|THEN|ELSE|GOSUB|RESTORE|RESUME)\s+(\d+(?:\s*,\s*\d+)*)/gi, function (match, cmd, nums) {
          var replacedNums = nums.split(',').map(function (ns) {
            var oldT = parseInt(ns.trim(), 10);
            return map[oldT] !== undefined ? String(map[oldT]) : ns.trim();
          }).join(', ');
          return cmd + ' ' + replacedNums;
        });
        newProg[newLn] = code;
      }
      this.program = newProg;
      this.compiledLines = Object.create(null);
      io.emitOk('RENUM 完了 (' + rLines.length + '行)');
      return;
    }

    // TFILES / FILES
    if (lower === 'tfiles' || lower === 'files') {
      var cnt = 0;
      io.emitSys('--- TEMP STORAGE (BROWSER) ---');
      for (var si = 0; si < localStorage.length; si++) {
        var key = localStorage.key(si);
        if (key && key.indexOf('webbasic:') === 0) {
          io.emit(key.slice(9) + ' (' + localStorage.getItem(key).length + ' bytes)');
          cnt++;
        }
      }
      if (cnt === 0) io.emit('NO FILES');
      return;
    }

    // TSAVE "name"
    m = s.match(/^TSAVE\s+("?)(.+)\1$/i);
    if (m) {
      var tsName = m[2].trim();
      try {
        localStorage.setItem('webbasic:' + tsName, JSON.stringify(this.program));
        io.emitOk('一時保存しました(Browser): ' + tsName);
      } catch (e) { io.emitErr(e.message || e); }
      return;
    }

    // TLOAD "name"
    m = s.match(/^TLOAD\s+("?)(.+)\1$/i);
    if (m) {
      var tlName = m[2].trim();
      var data = localStorage.getItem('webbasic:' + tlName);
      if (!data) { io.emitErr('見つかりません: ' + tlName); return; }
      try {
        this.clearProgram();
        var obj = JSON.parse(data) || {};
        var keys = Object.keys(obj);
        for (var ki = 0; ki < keys.length; ki++) {
          this.setLine(parseInt(keys[ki], 10), obj[keys[ki]]);
        }
        io.emitOk('読み込みました(Browser): ' + tlName);
      } catch (e) { io.emitErr(e.message || e); }
      return;
    }

    // TKILL / KILL "name"
    m = s.match(/^T?KILL\s+("?)(.+)\1$/i);
    if (m) {
      var tkName = m[2].trim();
      if (localStorage.getItem('webbasic:' + tkName) === null) {
        io.emitErr('見つかりません: ' + tkName);
      } else {
        localStorage.removeItem('webbasic:' + tkName);
        io.emitOk('削除しました: ' + tkName);
      }
      return;
    }

    // SAVE "name" / LOAD
    m = s.match(/^SAVE\s+("?)(.+)\1$/i);
    if (m) {
      io.onSaveFile(m[2].trim());
      return;
    }
    if (lower === 'load') {
      io.onLoadFile();
      return;
    }

    // SAMPLE [name|index]
    m = s.match(/^SAMPLES?(\s+("?)(.+)\2)?$/i);
    if (m) {
      io.onShowSamples(m[3] ? m[3].trim() : null);
      return;
    }

    if (lower === 'manual') {
      io.onOpenManual();
      return;
    }

    // UI 設定: UPPER / FONT / SIZE / THEME / WIDTH
    m = s.match(/^UPPER\s+(ON|OFF)$/i);
    if (m) { io.onUiSetting('upper', m[1].toLowerCase()); return; }

    m = s.match(/^FONT\s+(RETRO|DOT|MONO|PC98)$/i);
    if (m) { io.onUiSetting('font', m[1].toLowerCase()); return; }

    m = s.match(/^SIZE\s+(\d{1,3})$/i);
    if (m) { io.onUiSetting('size', m[1]); return; }

    m = s.match(/^THEME\s+(PC98|GREEN|AMBER|WHITE)$/i);
    if (m) { io.onUiSetting('theme', m[1].toLowerCase()); return; }

    m = s.match(/^WIDTH\s+(\d+)(?:\s*,\s*(\d+))?$/i);
    if (m) {
      io.gfx.textCols = parseInt(m[1], 10);
      if (m[2]) io.gfx.textRows = parseInt(m[2], 10);
      io.emitOk('WIDTH ' + io.gfx.textCols + ',' + io.gfx.textRows);
      return;
    }

    // HELP
    if (lower === 'help') {
      io.emitSys('Web BASIC 2.0 Help:');
      io.emitSys('  RUN [ln], CONT, LIST [a-b], NEW, CLEAR, DEL a[-b], EDIT ln, AUTO, RENUM');
      io.emitSys('  SAVE "name", LOAD, TSAVE/TLOAD/TFILES/TKILL, SAMPLE, MANUAL');
      io.emitSys('  FONT pc98|mono|retro|dot, SIZE n, THEME pc98|amber|white, UPPER on|off');
      io.emitSys('  IF/THEN/ELSE, FOR/NEXT, WHILE/WEND, GOSUB/RETURN, DATA/READ/RESTORE, DIM, DEF FN');
      io.emitSys('  GFX: SCREEN, CLS n, COLOR/BG/PALETTE, PSET/PLOT, LINE, RECT/BOX, CIRCLE, PAINT');
      io.emitSys('       TRIANGLE, SYMBOL, LOCATE, WINDOW, VIEW, ROLL, GSAVE/GPUT, VSYNC');
      io.emitSys('  SND: BEEP, SOUND freq,ms, PLAY "MML"');
      return;
    }

    // 直接文として即時実行 (複数文 : も対応)
    try {
      var directOps = compileLineStmts(s, 0);
      for (var oi = 0; oi < directOps.length; oi++) {
        var r = this._execOp(directOps[oi], oi);
        if (r && typeof r.then === 'function') await r;
      }
    } catch (e) {
      io.emitErr(e.message || String(e));
    }
  };

  WB.BasicRuntime = BasicRuntime;
})(window);
