#include "runtime.h"

typedef struct { String name; int32_t age; } User;
typedef struct { bool has_name; String name; bool has_age; int32_t age; } PartialUser;

static void PartialUser_free(PartialUser *self) {
    if (!self) return;
    tsc_string_release(self->name);
}

int main(void) {
    TSC_INIT();
    PartialUser u = {.has_name = false, .has_age = false};
    PartialUser_free(&u);
    return 0;
}
