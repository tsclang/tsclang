#include "runtime.h"
#include "std/blob.h"

typedef struct { uint8_t *data; size_t length; } Buffer;

int main(void) {
    TSC_INIT();
    uint8_t _buf_data_0[2] = {0};
    const Buffer buf = {.data = _buf_data_0, .length = 2};
    buf.data[0] = 104;
    buf.data[1] = 105;
    TscBlob b = tsc_blob_create(buf.data, buf.length, STR_LIT("text/plain"));
    String _blob_str_0 = tsc_blob_to_string(&b);
    String s = tsc_string_concat(STR_LIT("data: "), _blob_str_0);
    tsc_string_free(_blob_str_0);
    printf("%s\n", s.data);
    tsc_string_free(s);
    return 0;
}
