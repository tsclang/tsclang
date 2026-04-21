/* std/base64.h — TSClang base64 encode/decode */
#pragma once
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

static const char _tsc_b64_chars[] =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

static inline String tsc_btoa(String s) {
    const uint8_t *in = (const uint8_t *)s.data;
    size_t len = s.length;
    size_t out_len = 4 * ((len + 2) / 3);
    char *out = (char *)malloc(out_len + 1);
    size_t i = 0, j = 0;
    while (i < len) {
        size_t chunk = (len - i < 3) ? (len - i) : 3;
        uint32_t a = in[i];
        uint32_t b = chunk > 1 ? in[i+1] : 0;
        uint32_t c = chunk > 2 ? in[i+2] : 0;
        uint32_t triple = (a << 16) | (b << 8) | c;
        out[j++] = _tsc_b64_chars[(triple >> 18) & 0x3F];
        out[j++] = _tsc_b64_chars[(triple >> 12) & 0x3F];
        out[j++] = chunk > 1 ? _tsc_b64_chars[(triple >> 6) & 0x3F] : '=';
        out[j++] = chunk > 2 ? _tsc_b64_chars[triple & 0x3F] : '=';
        i += chunk;
    }
    out[j] = '\0';
    return (String){ .data = out, .length = j, .capacity = j + 1 };
}

static inline String tsc_atob(String s) {
    static const int8_t _dec[256] = {
        -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
        -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
        -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,62,-1,-1,-1,63,
        52,53,54,55,56,57,58,59,60,61,-1,-1,-1,-1,-1,-1,
        -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9,10,11,12,13,14,
        15,16,17,18,19,20,21,22,23,24,25,-1,-1,-1,-1,-1,
        -1,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,
        41,42,43,44,45,46,47,48,49,50,51,-1,-1,-1,-1,-1,
        -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
        -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
        -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
        -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
        -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
        -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
        -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
        -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
    };
    const char *in = s.data;
    size_t len = s.length;
    if (len % 4 != 0) return (String){ .data = (char *)"", .length = 0, .capacity = 0 };
    size_t out_len = len / 4 * 3;
    if (len > 0 && in[len-1] == '=') out_len--;
    if (len > 0 && in[len-2] == '=') out_len--;
    char *out = (char *)malloc(out_len + 1);
    size_t i = 0, j = 0;
    while (i < len) {
        uint32_t a = _dec[(uint8_t)in[i++]];
        uint32_t b = _dec[(uint8_t)in[i++]];
        uint32_t c = in[i] == '=' ? (i++, 0u) : (uint32_t)_dec[(uint8_t)in[i++]];
        uint32_t d = in[i] == '=' ? (i++, 0u) : (uint32_t)_dec[(uint8_t)in[i++]];
        uint32_t triple = (a << 18) | (b << 12) | (c << 6) | d;
        if (j < out_len) out[j++] = (triple >> 16) & 0xFF;
        if (j < out_len) out[j++] = (triple >> 8)  & 0xFF;
        if (j < out_len) out[j++] = triple & 0xFF;
    }
    out[j] = '\0';
    return (String){ .data = out, .length = j, .capacity = j + 1 };
}
