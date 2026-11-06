"use strict";
/**
 * Décompression LZO1X (d'après lzo1x_d.ch de la bibliothèque LZO), sans dépendance.
 * Sert au brouillard de guerre de la sauvegarde (FogData), compressé en LZO1X.
 */
function lzo1xDecompress(src, maxOut = 1 << 22) {
  const out = Buffer.alloc(maxOut);
  let op = 0;
  let ip = 0;
  const fail = (why) => {
    throw new Error(`LZO1X invalide : ${why}`);
  };
  const literals = (n) => {
    if (ip + n > src.length || op + n > maxOut) fail("littéraux");
    src.copy(out, op, ip, ip + n);
    ip += n;
    op += n;
  };
  const match = (dist, n) => {
    if (dist <= 0 || dist > op || op + n > maxOut) fail("distance");
    for (let i = 0; i < n; i++, op++) out[op] = out[op - dist];
  };
  const extend = (base) => {
    let t = 0;
    while (src[ip] === 0) {
      t += 255;
      ip++;
    }
    return t + base + src[ip++];
  };

  let t;
  let state;
  if (src[ip] > 17) {
    t = src[ip++] - 17;
    literals(t);
    if (t < 4) {
      t = src[ip++];
      state = "match";
    } else state = "first";
  } else state = "loop";

  for (;;) {
    if (ip > src.length) fail("fin de flux absente");
    if (state === "loop") {
      t = src[ip++];
      if (t >= 16) {
        state = "match";
        continue;
      }
      literals((t === 0 ? extend(15) : t) + 3);
      state = "first";
      continue;
    }
    if (state === "first") {
      t = src[ip++];
      if (t >= 16) {
        state = "match";
        continue;
      }
      match(1 + 0x0800 + (t >> 2) + (src[ip++] << 2), 3);
      state = "done";
      continue;
    }
    if (state === "match") {
      if (t >= 64) {
        const dist = 1 + ((t >> 2) & 7) + (src[ip++] << 3);
        match(dist, (t >> 5) + 1);
      } else if (t >= 32) {
        const n = (t & 31) === 0 ? extend(31) : t & 31;
        const dist = 1 + (src[ip] >> 2) + (src[ip + 1] << 6);
        ip += 2;
        match(dist, n + 2);
      } else if (t >= 16) {
        let dist = (t & 8) << 11;
        const n = (t & 7) === 0 ? extend(7) : t & 7;
        dist += (src[ip] >> 2) + (src[ip + 1] << 6);
        ip += 2;
        if (dist === 0) return out.subarray(0, op); // fin du flux
        match(dist + 0x4000, n + 2);
      } else {
        match(1 + (t >> 2) + (src[ip++] << 2), 2);
      }
      state = "done";
      continue;
    }
    // state === "done" : les 2 bits bas du dernier octet de distance donnent des littéraux en plus
    t = src[ip - 2] & 3;
    if (t === 0) {
      state = "loop";
      continue;
    }
    literals(t);
    t = src[ip++];
    state = "match";
  }
}

module.exports = { lzo1xDecompress };
