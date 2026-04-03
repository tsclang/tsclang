#include "runtime.h"
#include "std/blob.h"

typedef struct { uint8_t *data; size_t length; } Buffer;

int main(void) {
    TSC_INIT();
    uint8_t _buf_data_0[5] = {104, 101, 108, 108, 111};
    const Buffer buf = {.data = _buf_data_0, .length = 5};
    TscBlob b = tsc_blob_create(buf.data, buf.length, STR_LIT("text/plain"));
    String _text_0 = tsc_blob_text(&b);
    printf("%s\n", _text_0.data);
    tsc_string_free(_text_0);
    return 0;
}
