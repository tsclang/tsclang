#include "runtime.h"

typedef struct { String name; bool has_age; int32_t age; } User;
typedef struct { String name; int32_t age; } RequiredUser;

int main(void) {
    TSC_INIT();
    RequiredUser u = { .name = STR_LIT("Alice"), .age = 30 };
    printf("%d\n", u.age);
    return 0;
}
