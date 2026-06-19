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
    const String *name = &user.name;
    const int32_t *age = &user.age;
    printf("%s\n", name->data);
    printf("%d\n", *age);
    User_free(&user);
    return 0;
}
