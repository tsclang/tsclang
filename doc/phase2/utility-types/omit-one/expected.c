#include "runtime.h"

typedef struct { String name; int32_t age; String passwordHash; } User;
typedef struct { String name; int32_t age; } UserPublic;

int main(void) {
    TSC_INIT();
    const UserPublic u = {.name = STR_LIT("Alice"), .age = 30};
    printf("%s\n", u.name.data);
    return 0;
}
