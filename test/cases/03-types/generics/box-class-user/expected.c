#include "runtime.h"

typedef struct { String name; } User;
typedef struct { User value; } Box_User;

static User User_new(String name) {
    User self = {0};
    { String _tsc_tmp = name; tsc_string_retain(_tsc_tmp); tsc_string_release(self.name); self.name = _tsc_tmp; }
    return self;
}

static String User_greet(const User *self) {
    return tsc_string_concat(STR_LIT("Hello, "), self->name);
}

static Box_User Box_User_new(User v) {
    Box_User self = {0};
    self.value = v;
    return self;
}

static User Box_User_get(Box_User *self) {
    return self->value;
}

int main(void) {
    TSC_INIT();
    Box_User b = Box_User_new(User_new(STR_LIT("Alice")));
    User _chain_0 = Box_User_get(&b);
    printf("%s\n", User_greet(&_chain_0).data);
    return 0;
}
