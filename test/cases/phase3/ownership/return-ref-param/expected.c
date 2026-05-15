#include "runtime.h"

typedef struct { String name; } User;

const User *getRef_ref_User(const User *u) {
    return u;
}

static void User_free(User *self) {
    if (!self) return;
    tsc_string_release(self->name);
}

int main(void) {
    TSC_INIT();
    User u = {0};
    { String _tsc_tmp = STR_LIT("Alice"); tsc_string_retain(_tsc_tmp); tsc_string_release(u.name); u.name = _tsc_tmp; }
    const User *r = getRef_ref_User(&u);
    printf("%s\n", r.name.data);
    User_free(&u);
    return 0;
}
