#include "runtime.h"
#include "std/io.h"

typedef struct {
    size_t (*write)(void *self, const uint8_t *buf, size_t len);
} Writer_vtable;
typedef struct { void *self; const Writer_vtable *vtable; } Writer;

void emit_Writer_Array_u8(Writer w, Array_u8 data) {
    w.vtable->write(w.self, data.data, data.length);
}

int main(void) {
    TSC_INIT();
    return 0;
}
