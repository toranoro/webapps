/* Web BASIC 2.0 - High-Speed Expression Tokenizer & Compiler */
(function (global) {
  'use strict';

  var WB = global.WebBasic = global.WebBasic || {};

  // 組み込み関数名セット (引数なし呼び出し可能なものも含む)
  var ZERO_ARG_FNS = {
    'INKEY$': 1, 'TIMER': 1, 'TIME$': 1, 'DATE$': 1,
    'CSRLIN': 1, 'ERR': 1, 'ERL': 1, 'PI': 1, 'RND': 1
  };

  var BUILTIN_FNS = {
    // 数学
    'ABS': 1, 'INT': 1, 'FIX': 1, 'SGN': 1, 'SQR': 1,
    'SIN': 1, 'COS': 1, 'TAN': 1, 'ATN': 1, 'EXP': 1, 'LOG': 1,
    'RND': 1, 'PI': 1, 'RAD': 1, 'DEG': 1, 'MIN': 1, 'MAX': 1,
    'CINT': 1, 'CSNG': 1, 'CDBL': 1, 'CLNG': 1,
    // 文字列・変換
    'LEN': 1, 'LEFT$': 1, 'RIGHT$': 1, 'MID$': 1, 'INSTR': 1,
    'CHR$': 1, 'ASC': 1, 'STR$': 1, 'VAL': 1,
    'STRING$': 1, 'SPACE$': 1, 'HEX$': 1, 'OCT$': 1, 'BIN$': 1,
    'UCASE$': 1, 'UPPER$': 1, 'LCASE$': 1, 'LOWER$': 1, 'TRIM$': 1,
    // システム・グラフィック
    'INKEY$': 1, 'INPUT$': 1, 'TIMER': 1, 'TIME$': 1, 'DATE$': 1,
    'FRE': 1, 'POS': 1, 'CSRLIN': 1, 'ERR': 1, 'ERL': 1,
    'POINT': 1, 'SCREEN': 1, 'TAB': 1, 'SPC': 1, 'PEEK': 1
  };

  var KEYWORDS = {
    'AND': 1, 'OR': 1, 'XOR': 1, 'NOT': 1, 'MOD': 1, 'IMP': 1, 'EQV': 1
  };

  // スマートクォート等をASCII正規化
  function normalizeQuotes(s) {
    return s
      .replace(/[\u201C\u201D\uFF02]/g, '"')
      .replace(/[\u2018\u2019\uFF07]/g, "'");
  }

  function tokenizeExpr(src) {
    var s = normalizeQuotes(src);
    var tokens = [];
    var i = 0;
    var n = s.length;

    while (i < n) {
      var ch = s[i];
      if (ch === ' ' || ch === '\t' || ch === '\r') {
        i++;
        continue;
      }

      // 文字列リテラル
      if (ch === '"') {
        i++;
        var str = '';
        while (i < n && s[i] !== '"') {
          str += s[i++];
        }
        if (i < n && s[i] === '"') i++;
        tokens.push({ type: 'STR', value: str });
        continue;
      }

      // &H, &O, &B 数値リテラル
      if (ch === '&') {
        var next = (s[i + 1] || '').toUpperCase();
        var base = 0;
        var re = null;
        if (next === 'H') { base = 16; re = /[0-9A-Fa-f]/; i += 2; }
        else if (next === 'O') { base = 8; re = /[0-7]/; i += 2; }
        else if (next === 'B') { base = 2; re = /[01]/; i += 2; }
        else { base = 8; re = /[0-7]/; i += 1; }
        var digits = '';
        while (i < n && re.test(s[i])) digits += s[i++];
        if (!digits) throw new Error('数値リテラルが不正です: &');
        tokens.push({ type: 'NUM', value: parseInt(digits, base) });
        continue;
      }

      // 数値リテラル
      if ((ch >= '0' && ch <= '9') || (ch === '.' && i + 1 < n && s[i + 1] >= '0' && s[i + 1] <= '9')) {
        var start = i;
        while (i < n && s[i] >= '0' && s[i] <= '9') i++;
        if (i < n && s[i] === '.') {
          i++;
          while (i < n && s[i] >= '0' && s[i] <= '9') i++;
        }
        if (i < n && (s[i] === 'E' || s[i] === 'e' || s[i] === 'D' || s[i] === 'd')) {
          var expIdx = i + 1;
          if (expIdx < n && (s[expIdx] === '+' || s[expIdx] === '-')) expIdx++;
          if (expIdx < n && s[expIdx] >= '0' && s[expIdx] <= '9') {
            i = expIdx;
            while (i < n && s[i] >= '0' && s[i] <= '9') i++;
          }
        }
        // 型サフィックス #, !, % を読み飛ばす
        if (i < n && (s[i] === '#' || s[i] === '!' || s[i] === '%')) i++;
        var numStr = s.slice(start, i).replace(/[dD]/g, 'e').replace(/[#!]$/, '');
        var val = numStr.endsWith('%') ? (parseInt(numStr, 10) | 0) : parseFloat(numStr);
        tokens.push({ type: 'NUM', value: val });
        continue;
      }

      // 識別子 / キーワード
      if ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || ch === '_') {
        var idStart = i;
        i++;
        while (i < n && ((s[i] >= 'A' && s[i] <= 'Z') || (s[i] >= 'a' && s[i] <= 'z') || (s[i] >= '0' && s[i] <= '9') || s[i] === '_')) {
          i++;
        }
        if (i < n && (s[i] === '$' || s[i] === '%' || s[i] === '!' || s[i] === '#')) {
          i++;
        }
        var rawId = s.slice(idStart, i);
        var upperId = rawId.toUpperCase();
        if (KEYWORDS[upperId]) {
          tokens.push({ type: 'OP', value: upperId });
        } else {
          tokens.push({ type: 'ID', value: upperId });
        }
        continue;
      }

      // 2文字比較演算子
      var two = s.slice(i, i + 2);
      if (two === '<>' || two === '><' || two === '<=' || two === '=<' || two === '>=' || two === '=>') {
        var norm = two === '><' ? '<>' : (two === '=<' ? '<=' : (two === '=>' ? '>=' : two));
        tokens.push({ type: 'OP', value: norm });
        i += 2;
        continue;
      }

      // 1文字演算子・区切り
      if ('+-*/\\^=<>(),;'.indexOf(ch) !== -1) {
        if (ch === '(' || ch === ')' || ch === ',' || ch === ';') {
          tokens.push({ type: ch, value: ch });
        } else {
          tokens.push({ type: 'OP', value: ch });
        }
        i++;
        continue;
      }

      throw new Error('不正な文字です: ' + ch);
    }

    return tokens;
  }

  // 再帰下降パーサ -> クロージャに直接コンパイル
  function compileTokens(tokens, exprText) {
    var pos = 0;
    function peek() { return tokens[pos] || null; }
    function consume() { return tokens[pos++]; }

    function parseImpEqv() {
      var left = parseXor();
      while (peek() && peek().type === 'OP' && (peek().value === 'IMP' || peek().value === 'EQV')) {
        var op = consume().value;
        var right = parseXor();
        left = (function (a, b, o) {
          return o === 'IMP'
            ? function (rt) { return (~(a(rt) | 0) | (b(rt) | 0)); }
            : function (rt) { return ~((a(rt) | 0) ^ (b(rt) | 0)); };
        })(left, right, op);
      }
      return left;
    }

    function parseXor() {
      var left = parseOr();
      while (peek() && peek().type === 'OP' && peek().value === 'XOR') {
        consume();
        var right = parseOr();
        left = (function (a, b) {
          return function (rt) { return (a(rt) | 0) ^ (b(rt) | 0); };
        })(left, right);
      }
      return left;
    }

    function parseOr() {
      var left = parseAnd();
      while (peek() && peek().type === 'OP' && peek().value === 'OR') {
        consume();
        var right = parseAnd();
        left = (function (a, b) {
          return function (rt) { return (a(rt) | 0) | (b(rt) | 0); };
        })(left, right);
      }
      return left;
    }

    function parseAnd() {
      var left = parseNot();
      while (peek() && peek().type === 'OP' && peek().value === 'AND') {
        consume();
        var right = parseNot();
        left = (function (a, b) {
          return function (rt) { return (a(rt) | 0) & (b(rt) | 0); };
        })(left, right);
      }
      return left;
    }

    function parseNot() {
      if (peek() && peek().type === 'OP' && peek().value === 'NOT') {
        consume();
        var sub = parseNot();
        return function (rt) { return ~(sub(rt) | 0); };
      }
      return parseRel();
    }

    function parseRel() {
      var left = parseAdd();
      while (peek() && peek().type === 'OP' && (
        peek().value === '=' || peek().value === '<>' ||
        peek().value === '<' || peek().value === '>' ||
        peek().value === '<=' || peek().value === '>='
      )) {
        var op = consume().value;
        var right = parseAdd();
        left = (function (a, b, o) {
          switch (o) {
            case '=':  return function (rt) { return a(rt) === b(rt) ? -1 : 0; };
            case '<>': return function (rt) { return a(rt) !== b(rt) ? -1 : 0; };
            case '<':  return function (rt) { return a(rt) < b(rt) ? -1 : 0; };
            case '>':  return function (rt) { return a(rt) > b(rt) ? -1 : 0; };
            case '<=': return function (rt) { return a(rt) <= b(rt) ? -1 : 0; };
            case '>=': return function (rt) { return a(rt) >= b(rt) ? -1 : 0; };
          }
        })(left, right, op);
      }
      return left;
    }

    function parseAdd() {
      var left = parseMod();
      while (peek() && peek().type === 'OP' && (peek().value === '+' || peek().value === '-')) {
        var op = consume().value;
        var right = parseMod();
        if (op === '+') {
          left = (function (a, b) {
            return function (rt) {
              var va = a(rt), vb = b(rt);
              if (typeof va === 'string' || typeof vb === 'string') return String(va) + String(vb);
              return va + vb;
            };
          })(left, right);
        } else {
          left = (function (a, b) {
            return function (rt) { return (+a(rt)) - (+b(rt)); };
          })(left, right);
        }
      }
      return left;
    }

    function parseMod() {
      var left = parseIntDiv();
      while (peek() && peek().type === 'OP' && peek().value === 'MOD') {
        consume();
        var right = parseIntDiv();
        left = (function (a, b) {
          return function (rt) {
            var d = b(rt) | 0;
            if (d === 0) throw new Error('0 で除算しました (MOD)');
            return (a(rt) | 0) % d;
          };
        })(left, right);
      }
      return left;
    }

    function parseIntDiv() {
      var left = parseMul();
      while (peek() && peek().type === 'OP' && peek().value === '\\') {
        consume();
        var right = parseMul();
        left = (function (a, b) {
          return function (rt) {
            var d = Math.trunc(+b(rt));
            if (d === 0) throw new Error('0 で除算しました (\\)');
            return Math.trunc(Math.trunc(+a(rt)) / d);
          };
        })(left, right);
      }
      return left;
    }

    function parseMul() {
      var left = parseUnary();
      while (peek() && peek().type === 'OP' && (peek().value === '*' || peek().value === '/')) {
        var op = consume().value;
        var right = parseUnary();
        if (op === '*') {
          left = (function (a, b) {
            return function (rt) { return (+a(rt)) * (+b(rt)); };
          })(left, right);
        } else {
          left = (function (a, b) {
            return function (rt) {
              var d = +b(rt);
              if (d === 0) throw new Error('0 で除算しました');
              return (+a(rt)) / d;
            };
          })(left, right);
        }
      }
      return left;
    }

    function parseUnary() {
      if (peek() && peek().type === 'OP' && (peek().value === '+' || peek().value === '-')) {
        var op = consume().value;
        var sub = parseUnary();
        if (op === '+') return function (rt) { return +sub(rt); };
        return function (rt) { return -sub(rt); };
      }
      return parsePow();
    }

    function parsePow() {
      var base = parsePrimary();
      if (peek() && peek().type === 'OP' && peek().value === '^') {
        consume();
        var exp = parseUnary(); // 右結合
        return function (rt) { return Math.pow(+base(rt), +exp(rt)); };
      }
      return base;
    }

    function parseArgList() {
      var args = [];
      if (peek() && peek().type !== ')') {
        args.push(parseImpEqv());
        while (peek() && peek().type === ',') {
          consume();
          args.push(parseImpEqv());
        }
      }
      if (!peek() || peek().type !== ')') {
        throw new Error('閉じ括弧 ) が不足しています: ' + exprText);
      }
      consume(); // ')'
      return args;
    }

    function parsePrimary() {
      var t = peek();
      if (!t) throw new Error('式が不完全です: ' + exprText);

      if (t.type === 'NUM') {
        consume();
        var nv = t.value;
        return function () { return nv; };
      }

      if (t.type === 'STR') {
        consume();
        var sv = t.value;
        return function () { return sv; };
      }

      if (t.type === '(') {
        consume();
        var inner = parseImpEqv();
        if (!peek() || peek().type !== ')') throw new Error('閉じ括弧 ) がありません: ' + exprText);
        consume();
        return inner;
      }

      if (t.type === 'ID') {
        consume();
        var name = t.value;

        // ユーザー定義関数 FN...
        if (name.length > 2 && name.indexOf('FN') === 0) {
          var fnArgs = [];
          if (peek() && peek().type === '(') {
            consume();
            fnArgs = parseArgList();
          }
          return (function (fnName, argFns) {
            return function (rt) {
              var vals = new Array(argFns.length);
              for (var i = 0; i < argFns.length; i++) vals[i] = argFns[i](rt);
              return rt.callUserFn(fnName, vals);
            };
          })(name, fnArgs);
        }

        // 括弧付きの関数呼び出し or 配列アクセス
        if (peek() && peek().type === '(') {
          consume();
          var args = parseArgList();
          if (BUILTIN_FNS[name]) {
            return (function (fnName, argFns) {
              return function (rt) {
                var vals = new Array(argFns.length);
                for (var i = 0; i < argFns.length; i++) vals[i] = argFns[i](rt);
                return rt.callBuiltin(fnName, vals);
              };
            })(name, args);
          }
          // 配列アクセス
          return (function (arrName, idxFns) {
            return function (rt) {
              var idxs = new Array(idxFns.length);
              for (var i = 0; i < idxFns.length; i++) idxs[i] = idxFns[i](rt) | 0;
              return rt.getArray(arrName, idxs);
            };
          })(name, args);
        }

        // 引数なし組み込み関数 (INKEY$, TIMER, RND, PI 等)
        if (ZERO_ARG_FNS[name]) {
          return (function (fnName) {
            return function (rt) { return rt.callBuiltin(fnName, []); };
          })(name);
        }

        // スカラー変数
        return (function (varName) {
          return function (rt) { return rt.getVar(varName); };
        })(name);
      }

      throw new Error('式の構文エラー (' + t.value + '): ' + exprText);
    }

    var root = parseImpEqv();
    if (pos < tokens.length) {
      throw new Error('余分なトークンがあります (' + tokens[pos].value + '): ' + exprText);
    }
    return root;
  }

  var exprCache = Object.create(null);
  var CACHE_LIMIT = 4096;
  var cacheCount = 0;

  function compileExpr(exprText) {
    var key = String(exprText).trim();
    if (exprCache[key]) return exprCache[key];
    var tokens = tokenizeExpr(key);
    var fn = compileTokens(tokens, key);
    if (cacheCount >= CACHE_LIMIT) {
      exprCache = Object.create(null);
      cacheCount = 0;
    }
    exprCache[key] = fn;
    cacheCount++;
    return fn;
  }

  function clearExprCache() {
    exprCache = Object.create(null);
    cacheCount = 0;
  }

  WB.Expr = {
    compile: compileExpr,
    clearCache: clearExprCache,
    normalizeQuotes: normalizeQuotes
  };
})(window);
