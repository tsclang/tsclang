#include "runtime.h"

typedef struct { String name; } User;

String getName_ref_User(const User *u) {
    return u->name;
}

int main(void) {
    TSC_INIT();
    User user = {0};
    user.name = STR_LIT("Alice");
    const String n = getName_ref_User(&user);
    printf("%s\n", n.data);
    return 0;
}
