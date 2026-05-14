#include "runtime.h"

typedef struct { String name; int32_t age; String email; } User;
typedef struct { String name; String email; } UserContact;

static void UserContact_free(UserContact *self) {
    if (!self) return;
    tsc_string_release(self->name);
    tsc_string_release(self->email);
}

int main(void) {
    TSC_INIT();
    const UserContact u = { .name = STR_LIT("Bob"), .email = STR_LIT("bob@x.com") };
    printf("%s\n", u.email.data);
    UserContact_free(&u);
    return 0;
}
