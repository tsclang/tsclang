#include "runtime.h"
#include "std/io.h"

typedef struct {
    size_t (*read)(void *self, uint8_t *buf, size_t len);
} Reader_vtable;
typedef struct { void *self; const Reader_vtable *vtable; } Reader;

void consume_Reader(Reader r) {
    uint8_t _buf_data_0[64] = {0};
    Array_u8 buf = {.data = _buf_data_0, .length = 64, .capacity = 64};
    const size_t n = r.vtable->read(r.self, buf.data, buf.length);
    (void)n;
}

int main(void) {
    TSC_INIT();
    return 0;
}
