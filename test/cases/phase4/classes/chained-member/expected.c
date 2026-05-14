#include "runtime.h"

typedef struct { String name; } Inner;
typedef struct { Inner inner; } Outer;

int main(void) {
    TSC_INIT();
    Outer o = {0};
    o.inner = (Inner){0};
    { String _tsc_tmp = STR_LIT("hello"); tsc_string_retain(_tsc_tmp); tsc_string_release(o.inner.name); o.inner.name = _tsc_tmp; }
    printf("%s\n", o.inner.name.data);
    return 0;
}
