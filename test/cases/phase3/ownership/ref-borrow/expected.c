#include "runtime.h"

typedef struct { String name; } User;

String getName_ref_User(const User *u) {
    tsc_string_retain(u->name);
    return u->name;
}

static void User_free(User *self) {
    if (!self) return;
    tsc_string_release(self->name);
}

int main(void) {
    TSC_INIT();
    User user = {0};
    { String _tsc_tmp = STR_LIT("Alice"); tsc_string_retain(_tsc_tmp); tsc_string_release(user.name); user.name = _tsc_tmp; }
    const String n = getName_ref_User(&user);
    printf("%s\n", n.data);
    tsc_string_release(n);
    User_free(&user);
    return 0;
}
