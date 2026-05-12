#include "runtime.h"

typedef struct { String name; int32_t age; } User;

int main(void) {
    TSC_INIT();
    User u = {0};
    u.name = STR_LIT("Alice");
    u.age = 30;
    printf("%s\n", u.name.data);
    printf("%d\n", u.age);
    return 0;
}
