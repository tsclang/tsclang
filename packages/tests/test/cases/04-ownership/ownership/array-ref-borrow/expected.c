#include "runtime.h"

typedef struct { String name; } User;
typedef struct { User *data; size_t length; size_t capacity; } Array_User;

int main(void) {
    TSC_INIT();
    User _lit_0[] = {{0}};
    const Array_User users = {.data = _lit_0, .length = 1, .capacity = 1};
    { String _tsc_tmp = STR_LIT("Alice"); tsc_string_retain(_tsc_tmp); tsc_string_release(users.data[0].name); users.data[0].name = _tsc_tmp; }
    const User *u = &users.data[0];
    printf("%s\n", u->name.data);
    return 0;
}
