#include "runtime.h"

typedef struct { String name; } Owner;

static void Owner_free(Owner *self) {
    if (!self) return;
    tsc_string_release(self->name);
}

int main(void) {
    TSC_INIT();
    Owner o = {0};
    { String _tsc_tmp = STR_LIT("Alice"); tsc_string_retain(_tsc_tmp); tsc_string_release(o.name); o.name = _tsc_tmp; }
    tsc_string_retain(o.name);
    String n = o.name;
    printf("%s\n", n.data);
    tsc_string_release(n);
    Owner_free(&o);
    return 0;
}
