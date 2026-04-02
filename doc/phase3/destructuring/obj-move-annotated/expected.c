#include "runtime.h"

typedef struct { String name; int32_t age; } User;

int main(void) {
    TSC_INIT();
    User user = {0};
    user.name = STR_LIT("Alice");
    user.age = 30;
    String n = user.name;
    user = (User){0};
    printf("%s\n", n.data);
    return 0;
}
