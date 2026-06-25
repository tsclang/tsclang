#include "runtime.h"

typedef struct { String name; } User;

static User User_new(String name) {
    User self = {0};
    { String _tsc_tmp = name; tsc_string_retain(_tsc_tmp); tsc_string_release(self.name); self.name = _tsc_tmp; }
    return self;
}

static String User_greet(const User *self) {
    return tsc_string_concat(STR_LIT("Hello, "), self->name);
}

int main(void) {
    TSC_INIT();
    User _chain_0 = User_new(STR_LIT("A"));
    printf("%s\n", User_greet(&_chain_0).data);
    return 0;
}
