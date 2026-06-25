/* std/reactive.h — TSClang reactive signals (header-only, macro-based)
 * Signal_<T> types are typedef'd inline by codegen AFTER this include.
 * All functions are macros that work with any Signal_<T> struct shape:
 *   { T _value; void(**_effects)(void); size_t _effect_count; }
 */
#pragma once
#include <stdlib.h>

/* Maximum subscribers per signal */
#define TSC_SIGNAL_MAX_EFFECTS 16

/* Currently-running effect fn (NULL outside an effect) */
static void (*_tsc_current_effect)(void) = NULL;

/* tsc_signal_create_<T>(val): zero-init with value */
#define tsc_signal_create_i32(v)  { ._value = (v), ._effects = NULL, ._effect_count = 0, ._compute = NULL }
#define tsc_signal_create_i64(v)  { ._value = (v), ._effects = NULL, ._effect_count = 0, ._compute = NULL }
#define tsc_signal_create_f64(v)  { ._value = (v), ._effects = NULL, ._effect_count = 0, ._compute = NULL }
#define tsc_signal_create_bool(v) { ._value = (v), ._effects = NULL, ._effect_count = 0, ._compute = NULL }

/* Subscribe current effect to signal s */
#define _TSC_SIGNAL_TRACK(s) do { \
    if (_tsc_current_effect && (s)->_effect_count < TSC_SIGNAL_MAX_EFFECTS) { \
        if (!(s)->_effects) (s)->_effects = (void(**)(void))malloc(TSC_SIGNAL_MAX_EFFECTS * sizeof(void(*)(void))); \
        size_t _ii = 0; \
        for (; _ii < (s)->_effect_count; _ii++) if ((s)->_effects[_ii] == _tsc_current_effect) break; \
        if (_ii == (s)->_effect_count) (s)->_effects[(s)->_effect_count++] = _tsc_current_effect; \
    } \
} while(0)

/* Notify all subscribers of signal s (deferred during batch) */
#define _TSC_SIGNAL_NOTIFY(s) do { \
    for (size_t _ni = 0; _ni < (s)->_effect_count; _ni++) { \
        if (_tsc_batching) _tsc_batch_enqueue((s)->_effects[_ni]); \
        else (s)->_effects[_ni](); \
    } \
} while(0)

/* tsc_signal_get_<T>: read + track; computed signals evaluate lazily */
#define tsc_signal_get_i32(s)  ({ _TSC_SIGNAL_TRACK(s); (s)->_compute ? (s)->_compute() : (s)->_value; })
#define tsc_signal_get_i64(s)  ({ _TSC_SIGNAL_TRACK(s); (s)->_compute ? (s)->_compute() : (s)->_value; })
#define tsc_signal_get_f64(s)  ({ _TSC_SIGNAL_TRACK(s); (s)->_compute ? (s)->_compute() : (s)->_value; })
#define tsc_signal_get_bool(s) ({ _TSC_SIGNAL_TRACK(s); (s)->_compute ? (s)->_compute() : (s)->_value; })

/* tsc_signal_set_<T>: write + notify */
#define tsc_signal_set_i32(s, v)  do { (s)->_value = (v); _TSC_SIGNAL_NOTIFY(s); } while(0)
#define tsc_signal_set_i64(s, v)  do { (s)->_value = (v); _TSC_SIGNAL_NOTIFY(s); } while(0)
#define tsc_signal_set_f64(s, v)  do { (s)->_value = (v); _TSC_SIGNAL_NOTIFY(s); } while(0)
#define tsc_signal_set_bool(s, v) do { (s)->_value = (v); _TSC_SIGNAL_NOTIFY(s); } while(0)

/* tsc_effect(fn): run fn immediately and register as subscriber */
#define tsc_effect(fn) do { \
    void (*_prev_eff)(void) = _tsc_current_effect; \
    _tsc_current_effect = (fn); \
    (fn)(); \
    _tsc_current_effect = _prev_eff; \
} while(0)

/* tsc_computed_<T>(fn): lazy computed signal — fn() called on every get */
#define tsc_computed_i32(fn)  { ._value = (fn)(), ._effects = NULL, ._effect_count = 0, ._compute = (fn) }
#define tsc_computed_f64(fn)  { ._value = (fn)(), ._effects = NULL, ._effect_count = 0, ._compute = (fn) }

/* tsc_batch(fn): deferred notification — collect effects, run each once after fn */
#define TSC_BATCH_MAX_EFFECTS 64

static bool _tsc_batching = false;
static void (*_tsc_batch_queue[TSC_BATCH_MAX_EFFECTS])(void);
static size_t _tsc_batch_queue_len = 0;

static inline void _tsc_batch_enqueue(void (*fn)(void)) {
    for (size_t _i = 0; _i < _tsc_batch_queue_len; _i++)
        if (_tsc_batch_queue[_i] == fn) return;
    if (_tsc_batch_queue_len < TSC_BATCH_MAX_EFFECTS)
        _tsc_batch_queue[_tsc_batch_queue_len++] = fn;
}

#define tsc_batch(fn) do { \
    _tsc_batching = true; \
    _tsc_batch_queue_len = 0; \
    (fn)(); \
    _tsc_batching = false; \
    for (size_t _bi = 0; _bi < _tsc_batch_queue_len; _bi++) \
        _tsc_batch_queue[_bi](); \
} while(0)
