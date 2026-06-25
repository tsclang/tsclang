#include "runtime.h"

typedef struct { String data; } Buffer;

void consume_Buffer(Buffer buf) {
    printf("%s\n", buf.data.data);
}

static void Buffer_free(Buffer *self) {
    if (!self) return;
    tsc_string_release(self->data);
}

int main(void) {
    TSC_INIT();
    Buffer b = {0};
    { String _tsc_tmp = STR_LIT("hello"); tsc_string_retain(_tsc_tmp); tsc_string_release(b.data); b.data = _tsc_tmp; }
    consume_Buffer(b);
    b = (Buffer){0};
    Buffer_free(&b);
    return 0;
}
