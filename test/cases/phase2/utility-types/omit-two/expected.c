#include "runtime.h"

typedef struct { String name; int32_t age; String email; String role; } User;
typedef struct { String name; String role; } Minimal;

static void Minimal_free(Minimal *self) {
    if (!self) return;
    tsc_string_release(self->name);
    tsc_string_release(self->role);
}

int main(void) {
    TSC_INIT();
    const Minimal u = { .name = STR_LIT("X"), .role = STR_LIT("admin") };
    printf("%s\n", u.role.data);
    Minimal_free(&u);
    return 0;
}
