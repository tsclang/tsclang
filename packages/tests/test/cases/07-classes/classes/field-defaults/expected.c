#include "runtime.h"

typedef struct { int32_t v; String tag; } Box;

static void Box_free(Box *self) {
    if (!self) return;
    tsc_string_release(self->tag);
}

int main(void) {
    TSC_INIT();
    Box b = { .v = 7, .tag = STR_LIT("box") };
    printf("%d\n", b.v);
    printf("%s\n", b.tag.data);
    Box_free(&b);
    return 0;
}
