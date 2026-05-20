#include "runtime.h"

typedef struct tsc_unknown_vtable { void (*drop)(void *buf); void (*clone_into)(const void *src, void *dst); } tsc_unknown_vtable;
typedef struct { uint32_t type_id; const tsc_unknown_vtable *vtable; uint8_t buffer[3 * sizeof(void*)]; } tsc_unknown;
static const tsc_unknown_vtable _tsc_vt_i32 = {NULL, NULL};
static const tsc_unknown_vtable _tsc_vt_i64 = {NULL, NULL};
static const tsc_unknown_vtable _tsc_vt_f32 = {NULL, NULL};
static const tsc_unknown_vtable _tsc_vt_f64 = {NULL, NULL};
static const tsc_unknown_vtable _tsc_vt_bool = {NULL, NULL};
typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

static inline tsc_unknown tsc_unknown_from_i32(int32_t v) { tsc_unknown u = {.type_id = 1, .vtable = &_tsc_vt_i32}; memcpy(u.buffer, &v, sizeof(v)); return u; }
static inline int32_t tsc_unknown_get_i32(const tsc_unknown *self) { int32_t v; memcpy(&v, self->buffer, sizeof(v)); return v; }
static inline tsc_unknown tsc_unknown_from_i64(int64_t v) { tsc_unknown u = {.type_id = 2, .vtable = &_tsc_vt_i64}; memcpy(u.buffer, &v, sizeof(v)); return u; }
static inline int64_t tsc_unknown_get_i64(const tsc_unknown *self) { int64_t v; memcpy(&v, self->buffer, sizeof(v)); return v; }
static inline tsc_unknown tsc_unknown_from_f32(float v) { tsc_unknown u = {.type_id = 3, .vtable = &_tsc_vt_f32}; memcpy(u.buffer, &v, sizeof(v)); return u; }
static inline float tsc_unknown_get_f32(const tsc_unknown *self) { float v; memcpy(&v, self->buffer, sizeof(v)); return v; }
static inline tsc_unknown tsc_unknown_from_f64(double v) { tsc_unknown u = {.type_id = 4, .vtable = &_tsc_vt_f64}; memcpy(u.buffer, &v, sizeof(v)); return u; }
static inline double tsc_unknown_get_f64(const tsc_unknown *self) { double v; memcpy(&v, self->buffer, sizeof(v)); return v; }
static inline tsc_unknown tsc_unknown_from_bool(bool v) { tsc_unknown u = {.type_id = 5, .vtable = &_tsc_vt_bool}; memcpy(u.buffer, &v, sizeof(v)); return u; }
static inline bool tsc_unknown_get_bool(const tsc_unknown *self) { bool v; memcpy(&v, self->buffer, sizeof(v)); return v; }
#ifdef TSC_EMBEDDED
static void _tsc_unknown_drop_string(void *buf) { (void)buf; }
static void _tsc_unknown_clone_string(const void *src, void *dst) { memcpy(dst, src, sizeof(String)); }
static const tsc_unknown_vtable _tsc_vt_string = {_tsc_unknown_drop_string, _tsc_unknown_clone_string};
static inline tsc_unknown tsc_unknown_from_string(String s) { tsc_unknown u = {.type_id = 6, .vtable = &_tsc_vt_string}; memcpy(u.buffer, &s, sizeof(String)); return u; }
static inline String tsc_unknown_get_string(const tsc_unknown *self) { String s; memcpy(&s, self->buffer, sizeof(String)); return s; }
#else
static void _tsc_unknown_drop_string(void *buf) { String *ptr; memcpy(&ptr, buf, sizeof(ptr)); if (ptr) { tsc_string_release(*ptr); free(ptr); } }
static void _tsc_unknown_clone_string(const void *src, void *dst) { String *sp; memcpy(&sp, src, sizeof(String*)); String *dp = (String*)malloc(sizeof(String)); *dp = *sp; tsc_string_retain(*dp); memcpy(dst, &dp, sizeof(dp)); }
static const tsc_unknown_vtable _tsc_vt_string = {_tsc_unknown_drop_string, _tsc_unknown_clone_string};
static inline tsc_unknown tsc_unknown_from_string(String s) { String *ptr = (String*)malloc(sizeof(String)); *ptr = s; tsc_string_retain(*ptr); tsc_unknown u = {.type_id = 6, .vtable = &_tsc_vt_string}; memcpy(u.buffer, &ptr, sizeof(ptr)); return u; }
static inline String tsc_unknown_get_string(const tsc_unknown *self) { String *ptr; memcpy(&ptr, self->buffer, sizeof(ptr)); return *ptr; }
#endif
static inline void tsc_unknown_drop(tsc_unknown *self) { if (self->vtable && self->vtable->drop) self->vtable->drop(self->buffer); }
static void _tsc_unknown_drop_Array_i32(void *buf) { Array_i32 *ptr; memcpy(&ptr, buf, sizeof(ptr)); tsc_array_free_i32(ptr); free(ptr); }
static void _tsc_unknown_clone_Array_i32(const void *src, void *dst) { Array_i32 *sp; memcpy(&sp, src, sizeof(Array_i32*)); Array_i32 *dp = (Array_i32*)malloc(sizeof(Array_i32)); *dp = *sp; dp->data = (int32_t*)malloc(sizeof(int32_t) * dp->capacity); memcpy(dp->data, sp->data, sizeof(int32_t) * sp->length); memcpy(dst, &dp, sizeof(dp)); }
static const tsc_unknown_vtable _tsc_vt_Array_i32 = {_tsc_unknown_drop_Array_i32, _tsc_unknown_clone_Array_i32};
static inline tsc_unknown tsc_unknown_from_Array_i32(Array_i32 arr) { Array_i32 *heap = (Array_i32*)malloc(sizeof(Array_i32)); *heap = arr; if (arr.data && arr.length > 0) { size_t _cap = arr.capacity > 0 ? arr.capacity : arr.length; heap->data = (int32_t*)malloc(sizeof(int32_t) * _cap); memcpy(heap->data, arr.data, sizeof(int32_t) * arr.length); heap->capacity = _cap; } else { heap->data = NULL; heap->length = 0; heap->capacity = 0; } tsc_unknown u = {.type_id = 7, .vtable = &_tsc_vt_Array_i32}; memcpy(u.buffer, &heap, sizeof(heap)); return u; }
static inline Array_i32* tsc_unknown_get_Array_i32(const tsc_unknown *self) { Array_i32 *ptr; memcpy(&ptr, self->buffer, sizeof(ptr)); return ptr; }

void test(void) {
    int32_t _arr_data_0[] = {1, 2, 3};
    tsc_unknown x = tsc_unknown_from_Array_i32((Array_i32){.data = _arr_data_0, .length = 3, .capacity = 3});
    tsc_unknown_drop(&x);
}

int main(void) {
    TSC_INIT();
    test();
    return 0;
}
