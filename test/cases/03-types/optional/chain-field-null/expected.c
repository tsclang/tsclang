#include "runtime.h"

typedef struct { String name; } User;
typedef struct { bool has_value; User value; } opt_User;

int main(void) {
    TSC_INIT();
    opt_User u = {false, 0};
    opt_string n = u.has_value ? (opt_string){true, u.value.name} : (opt_string){false, 0};
    printf("%s\n", n.has_value ? n.value.data : "null");
    return 0;
}
