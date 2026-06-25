#include "runtime.h"

typedef struct { String name; } User;
typedef struct { bool has_value; User value; } opt_User;

static User User_new(String n) {
    User self = {0};
    { String _tsc_tmp = n; tsc_string_retain(_tsc_tmp); tsc_string_release(self.name); self.name = _tsc_tmp; }
    return self;
}

int main(void) {
    TSC_INIT();
    opt_User u = {true, User_new(STR_LIT("Alice"))};
    opt_string n = u.has_value ? (opt_string){true, u.value.name} : (opt_string){false, 0};
    printf("%s\n", n.has_value ? n.value.data : "null");
    return 0;
}
