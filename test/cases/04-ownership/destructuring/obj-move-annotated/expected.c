#include "runtime.h"

typedef struct { String name; int32_t age; } User;

static void User_free(User *self) {
    if (!self) return;
    tsc_string_release(self->name);
}

int main(void) {
    TSC_INIT();
    User user = {0};
    { String _tsc_tmp = STR_LIT("Alice"); tsc_string_retain(_tsc_tmp); tsc_string_release(user.name); user.name = _tsc_tmp; }
    user.age = 30;
    tsc_string_retain(user.name);
    String n = user.name;
    tsc_string_release(user.name);
    user = (User){0};
    printf("%s\n", n.data);
    tsc_string_release(n);
    User_free(&user);
    return 0;
}
