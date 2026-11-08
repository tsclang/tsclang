#include "runtime.h"

typedef struct { String _keys[TSC_MAP_CAP]; double _vals[TSC_MAP_CAP]; size_t size; } TscMap_string_f64;
typedef struct { bool has_value; double *value; } opt_ref_f64;

static inline TscMap_string_f64 tsc_map_create_string_f64(void) { TscMap_string_f64 m; m.size = 0; return m; }
static inline void tsc_map_set_string_f64(TscMap_string_f64 *m, String key, double val) {
    for (size_t _i = 0; _i < m->size; _i++) {
        if (_tsc_str_eq(m->_keys[_i], key)) { m->_vals[_i] = val; return; } }
    if (m->size < TSC_MAP_CAP) { m->_keys[m->size] = key; m->_vals[m->size] = val; m->size++; } }
static inline bool tsc_map_has_string_f64(const TscMap_string_f64 *m, String key) {
    for (size_t _i = 0; _i < m->size; _i++) {
        if (_tsc_str_eq(m->_keys[_i], key)) return true; }
    return false; }
static inline void tsc_map_delete_impl_string_f64(TscMap_string_f64 *m, String key) {
    for (size_t _i = 0; _i < m->size; _i++) {
        if (_tsc_str_eq(m->_keys[_i], key)) {
            memmove(&m->_keys[_i], &m->_keys[_i+1], (m->size-_i-1)*sizeof(String));
            memmove(&m->_vals[_i], &m->_vals[_i+1], (m->size-_i-1)*sizeof(double));
            m->size--; return; } } }
static inline void tsc_map_clear_string_f64(TscMap_string_f64 *m) { m->size = 0; }
#define tsc_map_get_string_f64(_m_, _key_) ({ \
    const TscMap_string_f64 *_mm_ = (_m_); \
    String _kk_ = (_key_); \
    double _vv_ = 0; bool _ff_ = false; \
    for (size_t _ii_ = 0; _ii_ < _mm_->size; _ii_++) { \
        if (_tsc_str_eq(_mm_->_keys[_ii_], _kk_)) \
            { _vv_ = _mm_->_vals[_ii_]; _ff_ = true; break; } \
    } \
    (opt_f64){ _ff_, _vv_ }; \
})
#define tsc_map_get_ref_string_f64(_m_, _key_) ({ \
    const TscMap_string_f64 *_mm_ = (_m_); \
    String _kk_ = (_key_); \
    double *_vp_ = NULL; \
    for (size_t _ii_ = 0; _ii_ < _mm_->size; _ii_++) { \
        if (_tsc_str_eq(_mm_->_keys[_ii_], _kk_)) \
            { _vp_ = (double *)&_mm_->_vals[_ii_]; break; } \
    } \
    (opt_ref_f64){ _vp_ != NULL, _vp_ }; \
})
#define tsc_map_delete_string_f64(_m_, _key_) ({ \
    TscMap_string_f64 *_mm_ = (_m_); \
    String _kk_ = (_key_); \
    bool _ff_ = false; \
    for (size_t _ii_ = 0; _ii_ < _mm_->size; _ii_++) { \
        if (_tsc_str_eq(_mm_->_keys[_ii_], _kk_)) { \
            _ff_ = true; \
            memmove(&_mm_->_keys[_ii_], &_mm_->_keys[_ii_+1], (_mm_->size-_ii_-1)*sizeof(String)); \
            memmove(&_mm_->_vals[_ii_], &_mm_->_vals[_ii_+1], (_mm_->size-_ii_-1)*sizeof(double)); \
            _mm_->size--; break; } } \
    _ff_; \
})
#define tsc_map_free_string_f64(m) ((void)(m))

int main(void) {
    TSC_INIT();
    TscMap_string_f64 m = tsc_map_create_string_f64();
    tsc_map_set_string_f64(&m, STR_LIT("a"), 1);
    printf("%s\n", tsc_map_get_ref_string_f64(&m, STR_LIT("a")).has_value ? tsc_dtoa((double)(*tsc_map_get_ref_string_f64(&m, STR_LIT("a")).value)) : "null");
    return 0;
}
