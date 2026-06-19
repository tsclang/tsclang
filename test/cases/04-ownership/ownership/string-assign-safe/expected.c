#include "runtime.h"

typedef struct { String p; } Holder;

static void Holder_free(Holder *self) {
    if (!self) return;
    tsc_string_release(self->p);
}

int main(void) {
    TSC_INIT();
    Holder h = {0};
    { String _tsc_tmp = STR_LIT("test"); tsc_string_retain(_tsc_tmp); tsc_string_release(h.p); h.p = _tsc_tmp; }
    printf("%s\n", h.p.data);
    Holder_free(&h);
    return 0;
}
