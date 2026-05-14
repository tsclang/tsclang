#include "runtime.h"

typedef struct { String name; int32_t age; String email; } User;
typedef struct { String name; } UserName;

static void UserName_free(UserName *self) {
    if (!self) return;
    tsc_string_release(self->name);
}

int main(void) {
    TSC_INIT();
    const UserName u = { .name = STR_LIT("Alice") };
    printf("%s\n", u.name.data);
    UserName_free(&u);
    return 0;
}
