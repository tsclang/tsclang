#include "runtime.h"

typedef struct { int32_t _refcount; int32_t _weakcount; int32_t v; } Box;

int main(void) {
    TSC_INIT();
    Box *a = tsc_arc_alloc(sizeof(Box));
    a->v = 1;
    Box *w = a;
    printf("%s\n", (w != NULL) ? "true" : "false");
    printf("%s\n", (a == NULL) ? "true" : "false");
    tsc_arc_release(a);
    return 0;
}
