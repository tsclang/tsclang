#include "runtime.h"

typedef struct { String data; } Holder;

static void Holder_free(Holder *self) {
    if (!self) return;
    tsc_string_release(self->data);
}

int main(void) {
    TSC_INIT();
    Holder h = {0};
    { String _tsc_tmp = STR_LIT("test"); tsc_string_retain(_tsc_tmp); tsc_string_release(h.data); h.data = _tsc_tmp; }
    tsc_string_retain(h.data);
    String d = h.data;
    printf("%s\n", h.data.data);
    tsc_string_release(d);
    Holder_free(&h);
    return 0;
}
